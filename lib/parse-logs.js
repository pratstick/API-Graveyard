'use strict';

/**
 * Traffic log parser. Understands the two formats people actually have:
 *
 *  1. NGINX / Apache "combined"/"common" access log lines:
 *     203.0.113.9 - - [24/Nov/2026:09:00:00 +0000] "GET /api/v1/products HTTP/1.1" 200 512 "-" "curl/8"
 *
 *  2. JSON lines ({method, path, ts} with a few tolerant alias keys):
 *     {"method":"GET","path":"/api/v1/products?page=2","ts":"2026-11-20T10:04:02Z"}
 *
 * Lines are auto-detected one by one, so mixed files are fine.
 * Query strings are stripped before matching; timestamps are ms epoch.
 */

const NGINX_RE = /^(\S+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+"([A-Z]+)\s+([^"\s]+)(?:\s+HTTP\/[\d.]+)?"\s+(\d{3})\s+(\S+)/;
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const MAX_REQUESTS = 200000;

function parseAccessTime(s) {
  const m = /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-])(\d{2})(\d{2})$/.exec(s);
  if (!m) return NaN;
  const [, d, mon, y, hh, mm, ss, sign, oh, om] = m;
  const offset = (sign === '-' ? -1 : 1) * ((+oh) * 60 + (+om)) * 60000;
  const utc = Date.UTC(+y, MONTHS[mon] ?? 0, +d, +hh, +mm, +ss);
  return utc - offset;
}

function stripQuery(p) {
  const i = p.indexOf('?');
  return i === -1 ? p : p.slice(0, i);
}

function parseJsonLine(line) {
  const o = JSON.parse(line);
  if (typeof o !== 'object' || !o) return null;
  const rawPath = o.path || o.url || o.p || o.route || o.request;
  if (typeof rawPath !== 'string' || !rawPath) return null;
  const method = String(o.method || o.m || o.http_method || 'GET').toUpperCase();
  const t = o.ts ?? o.timestamp ?? o.time ?? o.date ?? o.t ?? o['@timestamp'] ?? o.datetime;
  let ts = NaN;
  if (typeof t === 'number') ts = t < 1e12 ? t * 1000 : t;
  else if (typeof t === 'string') ts = Date.parse(t);
  return { method, path: stripQuery(rawPath), ts };
}

function parseLine(line) {
  const m = NGINX_RE.exec(line);
  if (m) {
    return { method: m[5].toUpperCase(), path: stripQuery(m[6]), ts: parseAccessTime(m[4]), status: +m[8] };
  }
  return parseJsonLine(line);
}

function parseLogs(text) {
  const requests = [];
  let skipped = 0;
  let jsonLines = 0;
  let accessLog = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let req = null;
    try { req = parseLine(line); } catch { req = null; }
    if (!req || !req.path || Number.isNaN(req.ts)) { skipped++; continue; }
    if (req.status !== undefined) accessLog++; else jsonLines++;
    requests.push({ method: req.method, path: req.path, ts: req.ts });
    if (requests.length >= MAX_REQUESTS) break;
  }
  return { requests, skipped, formats: { jsonLines, accessLog } };
}

module.exports = { parseLogs };
