'use strict';

/* ————— API Graveyard dashboard ————— */

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => [...(el || document).querySelectorAll(s)];

const STATUS = {
  alive:      { label: 'Alive',      icon: '💚', color: '#7fd4a0' },
  zombie:     { label: 'Zombie',     icon: '🧟', color: '#b6e86a' },
  deprecated: { label: 'Deprecated', icon: '🥀', color: '#a78bfa' },
  dying:      { label: 'Dying',      icon: '🕯️', color: '#e8b45a' },
  dead:       { label: 'Dead',       icon: '⚰️', color: '#9aa3b2' },
  forgotten:  { label: 'Forgotten',  icon: '🗿', color: '#7d89a0' },
};
const STATUS_ORDER = ['alive', 'zombie', 'deprecated', 'dying', 'dead', 'forgotten'];
const GRAVE_STATUSES = ['forgotten', 'dead', 'dying'];
const METHOD_COLORS = {
  GET: '#7fd4a0', POST: '#6ea8fe', PUT: '#e8b45a', PATCH: '#c77dff',
  DELETE: '#e2606b', HEAD: '#9aa3b2', OPTIONS: '#9aa3b2', ALL: '#9aa3b2',
};

const state = { report: null, status: 'all', method: 'all', q: '', sort: 'hits30' };
let ROUTE_INDEX = new Map();

/* ————— helpers ————— */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtNum(n) { return Number(n || 0).toLocaleString('en-US'); }
function byId(id) { return ROUTE_INDEX.get(id); }

function fmtLastSeen(r) {
  if (r.daysSinceLastSeen === null || r.daysSinceLastSeen === undefined) return 'never';
  const d = r.daysSinceLastSeen;
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return d + 'd ago';
  if (d < 365) return Math.round(d / 30) + 'mo ago';
  return (d / 365).toFixed(1) + 'y ago';
}

function verdict(score) {
  if (score >= 85) return 'Pristine grounds — the gardeners are proud.';
  if (score >= 70) return 'Well kept, a few fresh graves.';
  if (score >= 50) return 'Haunted — plan some deletions.';
  if (score >= 30) return 'The dead outnumber the living.';
  return 'The undead rule this codebase.';
}

function sparkSVG(values, w, h, color, fillOpacity = 0.18) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  let d = '';
  values.forEach((v, i) => {
    const x = (i * step).toFixed(1);
    const y = (h - 3 - (v / max) * (h - 6)).toFixed(1);
    d += (i ? ' L' : 'M') + x + ' ' + y;
  });
  const area = d + ` L${w} ${h} L0 ${h} Z`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${area}" fill="${color}" opacity="${fillOpacity}"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function matchesFilter(r) {
  if (state.status !== 'all' && r.status !== state.status) return false;
  if (state.method !== 'all' && r.method !== state.method) return false;
  if (state.q && !((r.id + ' ' + r.file).toLowerCase().includes(state.q))) return false;
  return true;
}

/* ————— rendering ————— */

function renderAll() {
  const r = state.report;
  ROUTE_INDEX = new Map(r.routes.map((x) => [x.id, x]));
  document.title = `API Graveyard — health ${r.summary.score}/100`;
  $('#score').textContent = r.summary.score;
  $('#scoreVerdict').textContent = verdict(r.summary.score);
  $('#metaLine').textContent =
    `${r.project.name} · ${r.project.filesScanned} source files scanned · ` +
    `${fmtNum(r.summary.requests)} requests parsed across ${r.logs.length} log file(s) · ` +
    `${r.summary.windowDays}-day window ending ${r.summary.window.to}`;
  renderChips();
  renderZombies();
  renderGraves();
  renderTable();
  renderGhosts();
}

function renderChips() {
  const s = state.report.summary;
  const chips = [
    { key: 'all', label: 'All routes', icon: '🪦', count: s.routes, color: '#cfd6e4' },
    ...STATUS_ORDER.map((k) => ({ key: k, label: STATUS[k].label, icon: STATUS[k].icon, count: s[k] || 0, color: STATUS[k].color })),
  ];
  $('#chips').innerHTML = chips.map((c) => `
    <button class="chip ${state.status === c.key ? 'active' : ''}" data-status="${c.key}" style="--c:${c.color}">
      <span>${c.icon}</span><span class="chip-count">${fmtNum(c.count)}</span><span class="chip-label">${c.label}</span>
    </button>`).join('');
  $$('#chips .chip').forEach((b) => {
    b.onclick = () => { state.status = b.dataset.status; renderChips(); renderGraves(); renderTable(); };
  });
}

function renderZombies() {
  const flagged = state.report.routes.filter((r) => r.status === 'zombie' || r.status === 'deprecated');
  const panel = $('#zombiePanel');
  if (!flagged.length) { panel.hidden = true; return; }
  panel.hidden = false;
  $('#zombieList').innerHTML = flagged.map((r) => `
    <button class="zombie-item" data-id="${esc(r.id)}">
      <span class="pill ${r.status}">${STATUS[r.status].icon} ${STATUS[r.status].label}</span>
      <code>${esc(r.id)}</code>
      <span class="zombie-note">${fmtNum(r.hits30)} calls in 30d · ${fmtNum(r.hits)} total${r.supersededBy ? ' · superseded by <code>' + esc(r.supersededBy) + '</code>' : ''}</span>
    </button>`).join('');
  $$('#zombieList .zombie-item').forEach((b) => { b.onclick = () => openModal(byId(b.dataset.id)); });
}

function renderGraves() {
  const graves = state.report.routes
    .filter((r) => GRAVE_STATUSES.includes(r.status))
    .filter(matchesFilter)
    .sort((a, b) =>
      GRAVE_STATUSES.indexOf(a.status) - GRAVE_STATUSES.indexOf(b.status) ||
      (a.daysSinceLastSeen ?? 1e9) - (b.daysSinceLastSeen ?? 1e9));
  const box = $('#graves');
  $('#graveCount').textContent = graves.length ? `${graves.length} graves found` : '';
  if (!graves.length) {
    box.innerHTML = `<div class="empty">🌙 The graveyard is empty${state.status !== 'all' || state.method !== 'all' || state.q ? ' for this filter' : ''}. Suspiciously healthy API…</div>`;
    return;
  }
  box.innerHTML = graves.map((r) => `
    <button class="grave grave-${r.status}" data-id="${esc(r.id)}">
      <span class="stone">
        <span class="moss"></span>
        <span class="rip">R I P</span>
        <span class="grave-path"><b class="m">${esc(r.method)}</b> <span>${esc(r.paths[0])}</span></span>
        <span class="grave-epitaph">“${esc(r.epitaph)}”</span>
        <span class="grave-meta">${r.hits === 0 ? 'never called' : 'last call ' + fmtLastSeen(r)} · ${fmtNum(r.hits)} visits${r.lastTouched ? ' · untouched since ' + r.lastTouched : ''}</span>
      </span>
      <span class="mound"></span>
    </button>`).join('');
  $$('#graves .grave').forEach((b) => { b.onclick = () => openModal(byId(b.dataset.id)); });
}

function renderTable() {
  const routes = state.report.routes.filter(matchesFilter);
  const sorters = {
    hits30: (a, b) => b.hits30 - a.hits30 || b.hits - a.hits,
    hits: (a, b) => b.hits - a.hits || b.hits30 - a.hits30,
    last: (a, b) => (a.daysSinceLastSeen ?? 1e9) - (b.daysSinceLastSeen ?? 1e9),
    path: (a, b) => (a.paths[0] || '').localeCompare(b.paths[0] || ''),
  };
  routes.sort(sorters[state.sort] || sorters.hits30);
  $('#invCount').textContent = fmtNum(routes.length);
  $('#invBody').innerHTML = routes.length ? routes.map((r) => {
    const st = STATUS[r.status];
    return `<tr data-id="${esc(r.id)}">
      <td><span class="pill ${r.status}">${st.icon} ${st.label}</span></td>
      <td><span class="mbadge" style="color:${METHOD_COLORS[r.method] || '#9aa3b2'}">${esc(r.method)}</span></td>
      <td class="path">${esc(r.paths[0])}${r.paths.length > 1 ? ` <span class="alt">+${r.paths.length - 1} more mount</span>` : ''}</td>
      <td class="num">${fmtNum(r.hits30)}</td>
      <td class="num">${fmtNum(r.hits)}</td>
      <td class="dim">${fmtLastSeen(r)}</td>
      <td class="trend">${sparkSVG(r.daily90.slice(-30), 88, 26, st.color)}</td>
      <td class="dim src">${esc(r.file)}:${r.line}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="8" class="empty">No routes match this filter.</td></tr>`;
  $$('#invBody tr[data-id]').forEach((tr) => { tr.onclick = () => openModal(byId(tr.dataset.id)); });
}

function renderGhosts() {
  const s = state.report.summary;
  const g = state.report.ghosts || [];
  $('#ghostCount').textContent = fmtNum(s.ghostRequests);
  $('#ghostBody').innerHTML = g.length ? g.slice(0, 12).map((x) => `
    <tr>
      <td class="path">${esc(x.path)}</td>
      <td class="num">${fmtNum(x.count)}</td>
      <td class="dim">${x.daysSinceLastSeen === 0 ? 'today' : x.daysSinceLastSeen === 1 ? 'yesterday' : x.daysSinceLastSeen + 'd ago'}</td>
    </tr>`).join('') : `<tr><td colspan="3" class="empty">No ghost traffic — every request found a home.</td></tr>`;
}

/* ————— modal / autopsy ————— */

async function openModal(r) {
  if (!r) return;
  const st = STATUS[r.status];
  const peak = Math.max(...r.daily90);
  $('#modalBody').innerHTML = `
    <div class="modal-head">
      <div>
        <span class="pill ${r.status}">${st.icon} ${st.label}</span>
        <h3><span class="mbadge" style="color:${METHOD_COLORS[r.method] || '#9aa3b2'}">${esc(r.method)}</span> ${esc(r.paths[0])}</h3>
      </div>
      <button class="btn icon" id="modalClose">✕</button>
    </div>
    <div class="autopsy-grid">
      <div class="cell"><b>${fmtNum(r.hits)}</b><span>total hits</span></div>
      <div class="cell"><b>${fmtNum(r.hits30)}</b><span>hits last 30d</span></div>
      <div class="cell"><b>${fmtNum(r.hits90)}</b><span>hits last 90d</span></div>
      <div class="cell"><b>${fmtLastSeen(r)}</b><span>last seen</span></div>
      <div class="cell wide"><b>${esc(r.file)}:${r.line}</b><span>defined in</span></div>
      <div class="cell"><b>${fmtNum(peak)}</b><span>peak req/day</span></div>
    </div>
    <div class="chart-card">
      <div class="chart-head"><span>requests per day · 90-day window</span><span class="dim">peak ${fmtNum(peak)}/day</span></div>
      ${sparkSVG(r.daily90, 640, 150, st.color, 0.22)}
      <div class="chart-axis"><span>${esc(state.report.dateKeys[0])}</span><span>${esc(state.report.dateKeys[state.report.dateKeys.length - 1])}</span></div>
    </div>
    <div class="cols">
      <div>
        <h4>☠ Cause of death</h4>
        <ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('') || '<li>No signals — still breathing.</li>'}</ul>
      </div>
      <div>
        <h4>🕯 Recent callers</h4>
        <ul class="samples">${r.samples.length ? r.samples.map((x) => `<li><code>${esc(x)}</code></li>`).join('') : '<li class="dim">No one. Not once.</li>'}</ul>
      </div>
    </div>
    <h4>📄 Source</h4>
    <pre class="source" id="srcPre">loading…</pre>`;
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#modalClose').onclick = closeModal;
  try {
    const res = await fetch(`/api/source?file=${encodeURIComponent(r.file)}&line=${r.line}`);
    const data = await res.json();
    const pre = $('#srcPre');
    if (data.lines) {
      pre.innerHTML = data.lines.map((l) =>
        `<span class="ln ${l.n === data.line ? 'hl' : ''}"><span class="no">${l.n}</span>${esc(l.text) || ' '}</span>`).join('\n');
    } else {
      pre.textContent = data.error || 'source unavailable';
    }
  } catch {
    $('#srcPre').textContent = 'source unavailable';
  }
}

function closeModal() {
  $('#modal').hidden = true;
  document.body.style.overflow = '';
}

/* ————— toast ————— */

let toastTimer = null;
function toast(msg, kind = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ' + kind;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
}

/* ————— import ————— */

async function importLogs(content) {
  if (!content.trim()) { toast('Choose a file or paste some log lines first.', 'warn'); return; }
  setImportStatus('Parsing & re-scanning…');
  try {
    const res = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (!res.ok) { setImportStatus(''); toast(data.error || 'Import failed.', 'error'); return; }
    toast(`Imported ${fmtNum(data.added)} requests (${data.skipped} unparseable line(s) skipped). Report updated.`, 'ok');
    setImportStatus(`Last import: +${fmtNum(data.added)} requests`);
    await refresh();
  } catch {
    setImportStatus('');
    toast('Import failed — network error.', 'error');
  }
}

async function resetLogs() {
  try {
    await fetch('/api/logs/reset', { method: 'POST' });
    toast('Imported logs cleared — back to the seeded demo traffic.', 'ok');
    setImportStatus('');
    await refresh();
  } catch {
    toast('Reset failed — network error.', 'error');
  }
}

async function refresh() {
  const res = await fetch('/api/report');
  state.report = await res.json();
  renderAll();
}

function setImportStatus(msg) { $('#importStatus').textContent = msg; }

/* ————— init ————— */

async function init() {
  $('#searchInput').addEventListener('input', (e) => {
    state.q = e.target.value.trim().toLowerCase();
    renderGraves(); renderTable();
  });
  $('#filterMethod').addEventListener('change', (e) => {
    state.method = e.target.value;
    renderGraves(); renderTable();
  });
  $('#sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value; renderTable();
  });
  $('#importBtn').addEventListener('click', () => importLogs($('#logText').value));
  $('#resetBtn').addEventListener('click', resetLogs);
  $('#fileInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    $('#fileName').textContent = f.name + ' (' + fmtNum(f.size) + ' bytes)';
    const text = await f.text();
    e.target.value = '';
    importLogs(text);
  });
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  try {
    const res = await fetch('/api/report');
    state.report = await res.json();
    renderAll();
  } catch {
    $('#metaLine').textContent = 'Failed to load the report — is the server running?';
  }
}

init();
