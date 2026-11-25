'use strict';

/**
 * API Graveyard — dashboard server.
 * Serves the UI plus a small JSON API:
 *   GET  /api/report       scan demo project + all traffic logs, full analysis
 *   POST /api/logs         import more traffic (nginx/combined or JSON lines)
 *   POST /api/logs/reset   drop imported logs, back to the seeded demo traffic
 *   GET  /api/source       source snippet for a route (safe: project dir only)
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { scanProject } = require('./lib/scan-routes');
const { parseLogs } = require('./lib/parse-logs');
const { analyze } = require('./lib/analyze');

const ROOT = __dirname;
const PROJECT_DIR = path.join(ROOT, 'data', 'demo-project');
const DEMO_TRAFFIC = path.join(ROOT, 'data', 'demo-traffic.jsonl');
const IMPORT_FILE = path.join(ROOT, 'data', 'imports', 'imported-traffic.log');
const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '30mb' }));

let cache = null;

function loadLogs() {
  const entries = [[DEMO_TRAFFIC, 'demo-traffic.jsonl (seeded)']];
  if (fs.existsSync(IMPORT_FILE)) entries.push([IMPORT_FILE, 'imported-traffic.log']);
  return entries.map(([file, label]) => {
    try {
      const parsed = parseLogs(fs.readFileSync(file, 'utf8'));
      return { file: label, requests: parsed.requests, skipped: parsed.skipped, formats: parsed.formats };
    } catch (e) {
      return { file: label, requests: [], skipped: 0, formats: { jsonLines: 0, accessLog: 0 }, error: String(e.message || e) };
    }
  });
}

function buildReport() {
  const logs = loadLogs();
  const requests = logs.flatMap((l) => l.requests);
  const scan = scanProject(PROJECT_DIR);
  const rep = analyze(scan.routes, requests);
  return {
    generatedAt: new Date().toISOString(),
    project: { name: 'Shoply API (demo project)', path: 'data/demo-project', filesScanned: scan.filesScanned },
    logs: logs.map((l) => ({
      file: l.file,
      requests: l.requests.length,
      skipped: l.skipped,
      formats: l.formats,
      error: l.error,
    })),
    ...rep,
  };
}

function importMtime() {
  try { return fs.existsSync(IMPORT_FILE) ? fs.statSync(IMPORT_FILE).mtimeMs : 0; } catch { return 0; }
}

app.get('/api/report', (req, res) => {
  const key = importMtime();
  if (!cache || cache.key !== key) cache = { key, report: buildReport() };
  res.json(cache.report);
});

app.post('/api/logs', (req, res) => {
  const content = (req.body && req.body.content) || '';
  if (!content.trim()) return res.status(400).json({ error: 'No log content provided.' });
  const parsed = parseLogs(content);
  if (!parsed.requests.length) {
    return res.status(400).json({
      error: 'Could not parse a single request. Expected NGINX/Apache access-log lines or JSON lines like {"method":"GET","path":"/x","ts":"2026-01-01T00:00:00Z"}.',
    });
  }
  fs.mkdirSync(path.dirname(IMPORT_FILE), { recursive: true });
  fs.appendFileSync(IMPORT_FILE, content.trimEnd() + '\n');
  cache = null;
  res.json({ added: parsed.requests.length, skipped: parsed.skipped, formats: parsed.formats });
});

app.post('/api/logs/reset', (req, res) => {
  try { fs.rmSync(IMPORT_FILE, { force: true }); } catch { /* noop */ }
  cache = null;
  res.json({ ok: true });
});

app.get('/api/source', (req, res) => {
  const rel = String(req.query.file || '');
  const line = parseInt(String(req.query.line || '0'), 10) || 0;
  const abs = path.resolve(PROJECT_DIR, rel);
  if (!abs.startsWith(path.resolve(PROJECT_DIR) + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return res.status(400).json({ error: 'Invalid file.' });
  }
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  const from = Math.max(1, line - 7);
  const to = Math.min(lines.length, line + 6);
  res.json({ file: rel, line, from, lines: lines.slice(from - 1, to).map((text, i) => ({ n: from + i, text })) });
});

app.use(express.static(path.join(ROOT, 'public')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\u26B0  API Graveyard is open at http://localhost:${PORT}`);
});
