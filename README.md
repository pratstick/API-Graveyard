# ⚰ API Graveyard

**Detects unused, deprecated and forgotten API endpoints in backend projects by analyzing traffic and source code.**

Your code defines 40 routes. Your users call 17. The other 23 are undead weight — attack surface, maintenance burden, and the stuff of 3 a.m. incidents. API Graveyard crosses-references **what your code serves** with **what your traffic actually calls**, then lays every dead endpoint to rest with a tombstone, an epitaph, and an autopsy.

---

## How it works

```
   source code                    traffic logs
  (Express/Koa/Fastify)      (nginx/combined · JSON lines)
        │                             │
        ▼                             ▼
  ┌───────────────┐          ┌────────────────┐
  │ route scanner │          │  log parser    │
  │ · routes      │          │ · per-request  │
  │ · app.use()   │          │   method/path  │
  │   mount graph │          │   + timestamp  │
  │ · @deprecated │          └────────┬───────┘
  │   & stale files│                 │
  └───────┬───────┘                  │
          └──────────┬───────────────┘
                     ▼
            ┌─────────────────┐
            │    analyzer     │  match every request → route
            │  classification │  90-day stats · epitaphs · ghosts
            └────────┬────────┘
                     ▼
        Dashboard (tombstones & autopsies)  ·  CLI report (JSON/table)
```

1. **Route scanner** (`lib/scan-routes.js`) — walks your project, finds `app.get('/x')` / `router.post('/y')` / `router.route('/z').put(...)` definitions (Express, Koa-router, Fastify style), resolves `app.use(prefix, router)` mounts so paths are the *real* external URLs, and picks up `@deprecated` markers, LEGACY/OBSOLETE comments, and untouched files.
2. **Log parser** (`lib/parse-logs.js`) — auto-detects NGINX/Apache combined-format lines and JSON lines (`{"method","path","ts"}`), line by line, stripping query strings.
3. **Analyzer** (`lib/analyze.js`) — matches every request to a route (`:param` patterns, `*` wildcards, most-specific-first), computes 90-day stats, classifies each route, and collects **ghost traffic** — requests arriving for routes that don't exist anywhere in the code.

## The six states of death

| Status | Meaning |
|---|---|
|  **Alive** | Healthy, recent traffic. Leave it alone. |
|  **Zombie** | Marked `@deprecated` in code but clients still hammer it. Deleting breaks production. |
|  **Deprecated** | Flagged in code (or superseded by a newer version) and barely used. Sunset candidate. |
|  **Dying** | A trickle of traffic, or nothing in the last 30 days. Schedule the funeral. |
|  **Dead** | Zero requests in the entire window. |
|  **Forgotten** | Zero requests **and** abandoned in code: stale file, LEGACY/OBSOLETE markers, superseded. |

Plus **👻 ghost traffic**: requests that arrived for routes that don't exist — deleted, renamed, or never deployed. Reverse-vandalism for your API.

## Run it

```bash
npm install
npm start            # dashboard on http://localhost:3000
```

The dashboard ships with a seeded demo: **Shoply API** (30 routes across 13 files) and 90 days of synthetic traffic (~31k requests). Import your own NGINX/JSON-lines logs in the UI to re-scan against them.

### CLI (scan your real project)

```bash
node cli.js --project ./src --logs access.log,app.jsonl          # table report
node cli.js --project ./src --logs access.log --json > report.json
```

### Import formats

```bash
# NGINX / Apache combined:
203.0.113.9 - - [24/Nov/2026:09:00:00 +0000] "GET /api/v1/products/48213 HTTP/1.1" 200 1531 "-" "curl/8"

# JSON lines (keys are tolerant):
{"method":"POST","path":"/api/v1/orders","ts":"2026-11-24T09:03:11Z"}
{"m":"GET","p":"/api/v1/cart?page=1","timestamp":1766600000000}
```

## Project layout

```
server.js               dashboard server (JSON API + static UI)
cli.js                  scanner CLI (--json for machine output)
lib/scan-routes.js      static route + mount-graph scanner
lib/parse-logs.js       nginx/combined + JSONL traffic parser
lib/analyze.js          matching, classification, epitaphs, ghosts
data/demo-project/      Shoply API — the demo service being scanned
data/generate-traffic.js  seeds the 90-day demo traffic log
public/                 dashboard UI (no external assets)
```

## Notes & limitations

- Route detection is regex-based (not a full AST): it covers the overwhelmingly common `(app|router|fastify).(get|post|…)('/path')` shape and `router.route('/x').get(...)` chains. Generated/reflective route tables (e.g. Nest decorators) are on the roadmap.
- "Dead" means *dead within the traffic you gave it*. Import a longer window before holding funerals.
- The scanner only reads your source; it never executes it.
