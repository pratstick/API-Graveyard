const express = require('express');
const router = express.Router();

// Exchange credentials for a JWT pair
router.post('/login', (req, res) => res.json({ token: '…', refresh: '…' }));

// Rotate an access token
router.post('/refresh', (req, res) => res.json({ token: '…' }));

// Invalidate the refresh token
router.post('/logout', (req, res) => res.json({ ok: true }));

module.exports = router;
