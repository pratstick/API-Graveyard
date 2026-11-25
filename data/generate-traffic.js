'use strict';

/**
 * Seeds a realistic 90-day traffic log (JSON lines) for the demo project.
 * Deterministic (seeded PRNG) so reports are stable across re-seeds.
 *
 * Writes: data/demo-traffic.jsonl
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'demo-traffic.jsonl');
const DAY = 864e5;
const DAYS = 90;
const SCALE = 0.6; // overall volume knob

let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const PRODUCT_IDS = Array.from({ length: 40 }, () => 48100 + Math.floor(rnd() * 900));
const USER_IDS = Array.from({ length: 40 }, () => 1000 + Math.floor(rnd() * 100));
const ORDER_IDS = Array.from({ length: 40 }, () => 70000 + Math.floor(rnd() * 500));
const CART_IDS = Array.from({ length: 40 }, () => 100 + Math.floor(rnd() * 100));
const CATEGORIES = ['shoes', 'shirts', 'hats', 'sale', 'new'];
const TERMS = ['nike', 'boots', 'red dress', 'sale', 'socks', 'jacket', 'umbrella'];

const flows = [];
function flow(method, tpl, vol, opts = {}) { flows.push({ method, tpl, vol, ...opts }); }

// ---- Alive and well -------------------------------------------------------
flow('GET', '/healthz', 96);
flow('GET', '/api/v1/products', 110, { query: ['', '', '?page={n}', '?category={c}', '?category={c}&sort=price_asc', '?q={q}'] });
flow('GET', '/api/v1/products/:id', 70);
flow('POST', '/api/v1/products', 4);
flow('GET', '/api/v1/products/:id/reviews', 22);
flow('GET', '/api/v1/search', 45, { query: ['?q={q}', '?q={q}&limit=10'] });
flow('POST', '/api/v1/auth/login', 28);
flow('POST', '/api/v1/auth/refresh', 18);
flow('POST', '/api/v1/auth/logout', 9);
flow('GET', '/api/v1/cart', 60);
flow('POST', '/api/v1/cart/items', 24);
flow('DELETE', '/api/v1/cart/items/:id', 12);
flow('POST', '/api/v1/orders', 15);
flow('GET', '/api/v1/orders/:id', 34);
flow('GET', '/api/v1/users/:id', 21);
flow('PUT', '/api/v1/users/:id', 5);

// ---- Zombie: deprecated, still hammered -----------------------------------
flow('POST', '/api/v1/mail/send', 34);

// ---- Deprecated, lightly used ----------------------------------------------
flow('GET', '/api/v1/products/search', 1.2, { query: ['?q={q}'] });

// ---- Dying: faded away months ago (day offsets from oldest, 0..89) --------
flow('GET', '/api/v1/reports/daily', 0, { onlyDays: [[5, 3], [12, 2], [25, 4]] });
flow('GET', '/api/v1/orders/:id/receipt', 0, { onlyDays: [[3, 1], [18, 1], [40, 1], [55, 1]] });

// ---- Ghost traffic: requests to routes that don't exist --------------------
flow('GET', '/.env', 1);
flow('GET', '/wp-login.php', 2);
flow('GET', '/xmlrpc.php', 1);
flow('GET', '/.git/config', 1);
flow('GET', '/old-api/users', 1);
flow('GET', '/api/v2/products', 3);
flow('GET', '/api/v1/fax/send', 1);

const endTs = Math.floor(Date.now() / DAY) * DAY + 20 * 3600e3; // last day ~20:00 local-ish

function buildPath(f) {
  let p = f.tpl;
  if (p.includes(':id')) {
    const pool = p.includes('/users/') ? USER_IDS
      : p.includes('/orders/') ? ORDER_IDS
        : p.includes('/cart/items') ? CART_IDS
          : PRODUCT_IDS;
    p = p.replace(':id', () => String(pick(pool)));
  }
  if (f.query && f.query.length) {
    let q = pick(f.query);
    q = q.replace('{n}', () => String(1 + Math.floor(rnd() * 40)));
    q = q.replace('{c}', () => pick(CATEGORIES));
    q = q.replace('{q}', () => pick(TERMS));
    p += q;
  }
  return p;
}

const lines = [];
for (let i = 0; i < DAYS; i++) {
  const dayStart = endTs - (DAYS - 1 - i) * DAY;
  for (const f of flows) {
    let n;
    if (f.onlyDays) {
      const e = f.onlyDays.find(([d]) => d === i);
      n = e ? e[1] : 0;
    } else {
      const v = f.vol * SCALE;
      n = Math.round(v * (0.5 + rnd()));
      if (rnd() < 0.06) n = Math.max(0, n - Math.ceil(v)); // occasional quiet day
    }
    for (let k = 0; k < n; k++) {
      const ts = dayStart + Math.floor(rnd() * (DAY * 0.96)) + 1200e3;
      lines.push({ method: f.method, path: buildPath(f), ts: new Date(Math.min(ts, endTs + DAY)).toISOString() });
    }
  }
}

fs.writeFileSync(OUT, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
console.log(`Wrote ${lines.length.toLocaleString()} requests over ${DAYS} days -> ${OUT}`);
