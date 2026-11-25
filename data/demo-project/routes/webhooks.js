const express = require('express');
const router = express.Router();

// Bank SSL-certificate callback. The bank switched to a hosted verification
// service and never told us the endpoint was retired.
router.post('/ssl-callback', (req, res) => res.json({ ok: true }));

// Webhook self-check used by a console script that was deleted long ago.
router.get('/health', (req, res) => res.json({ ok: true }));

module.exports = router;
