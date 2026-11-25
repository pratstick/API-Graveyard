// Shoply API — a medium-sized Express service, as found in the wild.
// This is the demo project that API Graveyard scans.
const express = require('express');
const app = express();

const products = require('./routes/products');
const legacySearch = require('./routes/legacy-search');
const cart = require('./routes/cart');
const auth = require('./routes/auth');
const orders = require('./routes/orders');
const users = require('./routes/users');
const reports = require('./routes/reports');
const search = require('./routes/search');
const webhooks = require('./routes/webhooks');
const mail = require('./routes/mail');
const fax = require('./routes/fax');
const clipboard = require('./routes/clipboard');

app.use('/api/v1/products', products);
app.use('/api/v1/products', legacySearch);
app.use('/api/v1/cart', cart);
app.use('/api/v1/auth', auth);
app.use('/api/v1/orders', orders);
app.use('/api/v1/users', users);
app.use('/api/v1/reports', reports);
app.use('/api/v1/search', search);
app.use('/api/v1/webhooks', webhooks);
app.use('/api/v1/mail', mail);
app.use('/api/v0/fax', fax);
app.use('/api/v0/clipboard', clipboard);

app.get('/healthz', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.get('/debug/env', (req, res) => res.json(process.env));

module.exports = app;
