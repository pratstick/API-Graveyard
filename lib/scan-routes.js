'use strict';

/**
 * Static route scanner for Express / Koa-router / Fastify style code:
 *
 *   app.get('/x', ...)             router.post('/y', ...)
 *   fastify.put('/z', ...)         router.route('/w').get(...)
 *
 * It also resolves `app.use(prefix, router)` mounts, so the reported paths
 * are the real, externally visible URLs (e.g. '/api/v1/products/:id'),
 * not just the raw strings inside the router files.
 */

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', 'out', 'target',
  '.next', 'vendor', '__pycache__', '.venv', 'test', 'tests',
]);
const CODE_EXT = /\.(js|cjs|mjs|jsx|ts|tsx)$/;

const METHOD_RE = /\b([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|del|options|head|all)\s*\(\s*(['"`])(\/[^'"`]*)\3/g;
const CHAIN_RE = /\.\s*route\s*\(\s*(['"`])(\/[^'"`]*)\1\s*\)\s*\.\s*(get|post|put|patch|delete|all)\s*\(/g;
const MOUNT_PREFIXED_RE = /\b([A-Za-z_$][\w$]*)\s*\.\s*use\s*\(\s*(['"`])(\/[^'"`]*)\2\s*,\s*([A-Za-z_$][\w$]*)\s*[,)]/g;
const MOUNT_BARE_RE = /\b([A-Za-z_$][\w$]*)\s*\.\s*use\s*\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g;
const REQUIRE_RE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const ROUTER_CREATE_RE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:express\.)?Router\s*\(/g;
const LAST_TOUCHED_RE = /@last-touched:?\s*(\d{4}-\d{2}-\d{2})/i;

const COMMON_ROUTER_NAMES = new Set(['app', 'router', 'server', 'api', 'fastify', 'route', 'rest']);

function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(abs);
      } else if (e.isFile() && CODE_EXT.test(e.name)) {
        out.push(abs);
      }
    }
  }
  return out;
}

function resolveRequire(fromFile, spec, root) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // bare spec -> node_modules
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    ...['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx'].map((ext) => base + ext),
    ...['.js', '.ts'].map((ext) => path.join(base, 'index' + ext)),
  ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) {
        const rel = path.relative(root, c).split(path.sep).join('/');
        return rel.startsWith('..') ? null : rel;
      }
    } catch { /* try next candidate */ }
  }
  return null;
}

function joinPaths(a, b) {
  let s = (a || '') + '/' + (b || '');
  s = s.replace(/\/{2,}/g, '/');
  if (s.length > 1) s = s.replace(/\/+$/, '');
  if (!s) s = '/';
  return s;
}

function scanProject(root) {
  root = path.resolve(root);
  const files = walk(root);

  const infos = new Map(); // rel -> file info
  for (const abs of files) {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    let mtime = null;
    try { mtime = fs.statSync(abs).mtimeMs; } catch { /* noop */ }

    const requires = [];
    for (const m of text.matchAll(REQUIRE_RE)) requires.push({ name: m[1], spec: m[2] });

    const routerVars = new Set(COMMON_ROUTER_NAMES);
    for (const m of text.matchAll(ROUTER_CREATE_RE)) routerVars.add(m[1]);
    const varToFile = {};
    for (const r of requires) {
      const target = resolveRequire(abs, r.spec, root);
      if (target) {
        varToFile[r.name] = target;
        routerVars.add(r.name);
      }
    }

    const mounts = [];
    for (const m of text.matchAll(MOUNT_PREFIXED_RE)) mounts.push({ prefix: m[3], target: m[4] });
    for (const m of text.matchAll(MOUNT_BARE_RE)) {
      if (varToFile[m[2]]) mounts.push({ prefix: '', target: m[2] });
    }

    // Optional staleness override written in the file header (useful for demo
    // repos and containers where real mtimes get reset):
    //   // @last-touched: 2019-04-12
    const head = lines.slice(0, 40).join('\n');
    const touched = LAST_TOUCHED_RE.exec(head);

    infos.set(rel, { rel, abs, lines, mtime, touched: touched ? touched[1] : null, varToFile, mounts, routerVars });
  }

  // Resolve the mount graph -> external prefixes per router file.
  const prefixes = new Map(); // rel -> [prefix, ...]
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const info of infos.values()) {
      const base = prefixes.get(info.rel) || [''];
      for (const m of info.mounts) {
        const target = info.varToFile[m.target];
        if (!target || !infos.has(target)) continue;
        for (const b of base) {
          const p = joinPaths(b, m.prefix);
          if (!prefixes.has(target)) prefixes.set(target, []);
          const list = prefixes.get(target);
          if (!list.includes(p)) { list.push(p); changed = true; }
        }
      }
    }
    if (!changed) break;
  }

  // Collect route definitions.
  const routes = [];
  for (const info of infos.values()) {
    const { lines, rel, routerVars } = info;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      let found = null;
      for (const m of ln.matchAll(METHOD_RE)) {
        if (!routerVars.has(m[1])) continue; // filters out axios.get(...) etc.
        found = { method: m[2] === 'del' ? 'delete' : m[2], rawPath: m[4], file: rel, line: i + 1 };
      }
      if (!found) {
        for (const cm of ln.matchAll(CHAIN_RE)) {
          found = { method: cm[3], rawPath: cm[2], file: rel, line: i + 1 };
          break;
        }
      }
      if (!found) continue;

      // Deprecation / legacy signals in the contiguous comment block directly
      // above the route (JSDoc or // lines). Stops at the first code line so
      // a neighbour's comments don't bleed into this route.
      const commentLines = [];
      for (let j = i - 1; j >= 0; j--) {
        const t = lines[j].trim();
        if (t === '') break;
        if (t.startsWith('/*') || t.startsWith('*') || t.startsWith('//') || t.endsWith('*/')) {
          commentLines.unshift(lines[j]);
        } else break;
      }
      const window = commentLines.join('\n');
      const deprecated = /@deprecated/i.test(window);
      const legacyComment = /\b(LEGACY|OBSOLETE|DO NOT USE|NO LONGER USED|KEPT FOR BACKWARDS? COMPAT)\b/i.test(window);

      const paths = (prefixes.get(rel) || ['']).map((p) => joinPaths(p, found.rawPath));
      routes.push({ ...found, method: found.method.toUpperCase(), paths: [...new Set(paths)], deprecated, legacyComment });
    }
  }

  // Staleness of the defining file (header override wins, real mtime as fallback).
  const NOW = Date.now();
  const YEAR = 365 * 864e5;
  for (const r of routes) {
    const info = infos.get(r.file);
    r.staleFile = false;
    r.lastTouched = null;
    const touchedRaw = info.touched ? Date.parse(info.touched) : NaN;
    if (!Number.isNaN(touchedRaw) && NOW - touchedRaw > YEAR) {
      r.staleFile = true;
      r.lastTouched = info.touched;
    } else if (info.mtime && NOW - info.mtime > YEAR) {
      r.staleFile = true;
      r.lastTouched = new Date(info.mtime).toISOString().slice(0, 10);
    }
  }

  return { root, filesScanned: files.length, routes };
}

module.exports = { scanProject };
