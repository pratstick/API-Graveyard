'use strict';

/**
 * Cross-references scanned routes with parsed traffic.
 *
 *  - Matches every request to a route (method + path pattern, Express-style
 *    ':param' segments and '*' wildcards, most-specific pattern first).
 *  - Computes per-route stats over a 90-day window.
 *  - Classifies each route:
 *        alive      — healthy, recent traffic
 *        deprecated — flagged in source (@deprecated / superseded) but lightly used
 *        zombie     — flagged in source yet still hammered by clients
 *        dying      — a trickle of traffic, or none in the last 30 days
 *        dead       — zero requests in the whole window
 *        forgotten  — zero requests AND abandoned in code (stale file,
 *                     legacy markers, superseded)
 *  - Aggregates "ghost traffic": requests that arrived for routes that
 *    don't exist anywhere in the code.
 */

const DAY = 864e5;
const WINDOW_DAYS = 90;

const EPITAPHS = [
  'Served with distinction until the roadmap moved on.',
  'Nobody called. Nobody wrote. Nobody remembered.',
  'It waited by the phone until the phone was unplugged.',
  'Shipped in a sprint, mourned in silence.',
  'Once a headline feature. Now a footnote in the changelog.',
  'The pager never rang. The logs grew quiet. The dust settled.',
  'Held the API together once. Now it holds only dust.',
  'Built for a product launch that was quietly cancelled.',
  'Its OpenAPI spec outlived it.',
  'Loved by the integration tests. Ignored by the world.',
  'The wiki page that described it no longer exists either.',
  'Last commit message: "temporary workaround". It lied.',
  'Deprecated in a pull request nobody read.',
  'It died as it lived: returning 200 OK to no one.',
];

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function routeToRegex(p) {
  const parts = p.split('/').map((seg) => {
    if (seg === '') return '';
    if (seg.startsWith(':')) return '([^/]+)';
    if (seg === '*') return '(.*)';
    return seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp('^' + parts.join('/') + '/?$');
}

// Lower = more specific; most-specific patterns try first.
function specificity(p) {
  const segs = p.split('/').filter(Boolean);
  const params = segs.filter((s) => s.startsWith(':') || s === '*').length;
  return params * 10 - (segs.length - params);
}

function classify(routes) {
  // Supersession across API versions: /api/v0/x vs /api/v1/x
  const bySig = new Map();
  for (const r of routes) {
    const p = r.paths[0] || r.rawPath || '';
    const vm = /^\/(?:api\/)?v(\d+)(?=\/|$)/.exec(p);
    r._v = vm ? +vm[1] : 0;
    r._sig = r.method + ' ' + (vm ? p.slice(vm[0].length) || '/' : p).replace(/:[^/]+/g, ':x');
    if (!bySig.has(r._sig)) bySig.set(r._sig, []);
    bySig.get(r._sig).push(r);
  }
  for (const group of bySig.values()) {
    if (group.length < 2) continue;
    const maxV = Math.max(...group.map((r) => r._v));
    const heir = group.find((r) => r._v === maxV);
    for (const r of group) {
      if (r._v < maxV && heir) r.supersededBy = heir.paths[0] || heir.rawPath;
    }
  }

  for (const r of routes) {
    const signals = [];
    if (r.deprecated) signals.push('marked @deprecated in source');
    if (r.legacyComment) signals.push('legacy/obsolete marker in source comments');
    if (r.staleFile) signals.push('source file untouched since ' + r.lastTouched);
    if (r.supersededBy) signals.push('superseded by ' + r.supersededBy);

    let status;
    if (r.hits === 0) status = signals.length ? 'forgotten' : 'dead';
    else if (r.deprecated || r.supersededBy) status = r.hits30 >= 30 ? 'zombie' : 'deprecated';
    else if (r.hits30 === 0) status = 'dying';
    else if (r.hits90 <= 3) status = 'dying';
    else status = 'alive';

    if (r.hits === 0) signals.unshift('zero requests in the entire traffic window');
    else if (status === 'dying' && r.hits30 === 0) signals.push('no requests in the last 30 days');
    else if (status === 'dying') signals.push('only ' + r.hits30 + ' request(s) in the last 30 days');

    r.status = status;
    r.reasons = signals;
  }
}

function analyze(routeList, requests) {
  const now = requests.length
    ? requests.reduce((m, r) => Math.max(m, r.ts), 0)
    : Date.now();
  const startDate = (Math.floor(now / DAY) - (WINDOW_DAYS - 1)) * DAY;
  const dateKeys = Array.from({ length: WINDOW_DAYS }, (_, i) =>
    new Date(startDate + i * DAY).toISOString().slice(0, 10));
  const keySet = new Set(dateKeys);

  const routes = routeList.map((r) => ({
    ...r,
    hits: 0, hits30: 0, hits90: 0,
    lastSeen: null, firstSeen: null,
    daily: Object.create(null),
    samples: [],
  }));
  for (const r of routes) {
    r.paths = r.paths && r.paths.length ? r.paths : [r.rawPath];
    r.re = r.paths.map(routeToRegex);
    r.spec = Math.min(...r.paths.map(specificity));
  }
  routes.sort((a, b) => a.spec - b.spec || a.method.localeCompare(b.method));

  const ghosts = new Map();
  let ghostRequests = 0;

  for (const req of requests) {
    let hit = null;
    for (const r of routes) {
      if (r.method !== 'all' && r.method !== req.method) continue;
      for (const re of r.re) {
        if (re.test(req.path)) { hit = r; break; }
      }
      if (hit) break;
    }
    if (!hit) {
      ghostRequests++;
      const g = ghosts.get(req.path);
      if (g) { g.count++; if (req.ts > g.lastSeen) g.lastSeen = req.ts; }
      else ghosts.set(req.path, { path: req.path, count: 1, lastSeen: req.ts });
      continue;
    }
    hit.hits++;
    if (hit.lastSeen === null || req.ts > hit.lastSeen) hit.lastSeen = req.ts;
    if (hit.firstSeen === null || req.ts < hit.firstSeen) hit.firstSeen = req.ts;
    const k = new Date(req.ts).toISOString().slice(0, 10);
    if (keySet.has(k)) hit.daily[k] = (hit.daily[k] || 0) + 1;
    if (hit.samples.length < 6 && !hit.samples.includes(req.path)) hit.samples.push(req.path);
  }

  for (const r of routes) {
    r.daily90 = dateKeys.map((k) => r.daily[k] || 0);
    r.hits90 = r.daily90.reduce((a, b) => a + b, 0);
    r.hits30 = r.daily90.slice(-30).reduce((a, b) => a + b, 0);
    r.daysSinceLastSeen = r.lastSeen === null ? null : Math.floor((now - r.lastSeen) / DAY);
    r.id = r.method + ' ' + r.paths[0];
    delete r.daily; delete r.re; delete r.spec;
  }

  classify(routes);

  const weights = { alive: 1, deprecated: 0.5, zombie: 0.25, dying: 0.4, dead: 0, forgotten: 0 };
  const summary = {
    routes: routes.length,
    alive: 0, deprecated: 0, zombie: 0, dying: 0, dead: 0, forgotten: 0,
    requests: requests.length,
    ghostPaths: ghosts.size,
    ghostRequests,
    windowDays: WINDOW_DAYS,
    window: { from: dateKeys[0], to: dateKeys[dateKeys.length - 1] },
  };
  let scoreSum = 0;
  for (const r of routes) {
    summary[r.status]++;
    scoreSum += weights[r.status] || 0;
    r.epitaph = EPITAPHS[hash(r.id) % EPITAPHS.length];
  }
  summary.score = Math.round((100 * scoreSum) / Math.max(1, routes.length));

  const ghostsArr = [...ghosts.values()]
    .map((g) => ({ ...g, daysSinceLastSeen: Math.floor((now - g.lastSeen) / DAY) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  routes.sort((a, b) =>
    (a.paths[0] || '').localeCompare(b.paths[0] || '') || a.method.localeCompare(b.method));

  return { summary, routes, ghosts: ghostsArr, dateKeys };
}

module.exports = { analyze };
