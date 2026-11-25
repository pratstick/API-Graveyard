#!/usr/bin/env node
'use strict';

/**
 * API Graveyard — CLI scanner.
 *
 *   node cli.js --project ./src --logs access.log,app.jsonl [--json]
 *
 * Prints the same classification the dashboard shows. Use --json to get the
 * full machine-readable report (includes per-day traffic arrays).
 */

const fs = require('fs');
const { scanProject } = require('./lib/scan-routes');
const { parseLogs } = require('./lib/parse-logs');
const { analyze } = require('./lib/analyze');

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}

const project = arg('project') || '.';
const logsArg = arg('logs');
const asJson = process.argv.includes('--json');

const ICON = { alive: '\u2705', deprecated: '\u{1F339}', zombie: '\u{1F9DF}', dying: '\u{1F56F}\uFE0F', dead: '\u26B0\uFE0F ', forgotten: '\u{1F5FF}' };

const requests = [];
const logSources = [];
if (logsArg) {
  for (const f of logsArg.split(',')) {
    const file = f.trim();
    if (!file) continue;
    try {
      const parsed = parseLogs(fs.readFileSync(file, 'utf8'));
      requests.push(...parsed.requests);
      logSources.push(`${file} (${parsed.requests.length} req)`);
    } catch (e) {
      console.error(`warning: could not read ${file}: ${e.message}`);
    }
  }
}

const scan = scanProject(project);
const report = analyze(scan.routes, requests);

if (asJson) {
  console.log(JSON.stringify({ project: { path: project, filesScanned: scan.filesScanned }, logs: logSources, ...report }, null, 2));
  process.exit(0);
}

const s = report.summary;
console.log('\u26B0  API Graveyard \u2014 scan report');
console.log(`Project: ${project}  (${scan.filesScanned} files, ${s.routes} routes)`);
console.log(`Traffic: ${s.requests.toLocaleString()} requests${logSources.length ? ' from ' + logSources.join(', ') : '  (no --logs given; every route will read as dead)'}`);
console.log(`Window:  ${s.windowDays} days ending ${s.window.to}`);
console.log(`Health:  ${s.score}/100`);
console.log('');
console.log('STATUS      METHOD  PATH                                        30d    ALL   LAST SEEN');
for (const r of report.routes) {
  const last = r.daysSinceLastSeen === null ? 'never' : r.daysSinceLastSeen === 0 ? 'today' : r.daysSinceLastSeen + 'd ago';
  const line =
    (ICON[r.status] + ' ' + r.status).padEnd(16) +
    r.method.padEnd(8) +
    (r.paths[0] || '').padEnd(44) +
    String(r.hits30).padEnd(7) +
    String(r.hits).padEnd(6) +
    last;
  console.log(line);
}

if (report.ghosts.length) {
  console.log('');
  console.log('\u{1F47B}  Ghost traffic \u2014 requests with no matching route:');
  for (const g of report.ghosts.slice(0, 10)) {
    console.log('   ' + g.path.padEnd(44) + '\u00D7' + g.count);
  }
}
console.log('');
console.log('Tip: open the dashboard (npm start) for tombstones, epitaphs and autopsies.');
