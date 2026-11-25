// LEGACY MODULE — FaxGateway integration for Shoply Retail POS.
// @last-touched: 2019-04-12
// The fax gateway vendor shut down in Q3 2019. Kept "just in case" the
// warehouse asks for it again. They will not.
const express = require('express');
const router = express.Router();

// LEGACY: no clients since the POS 4 migration
router.get('/outbox', (req, res) => res.json({ items: [] }));

// LEGACY: used only by the old POS desktop client
router.post('/send', (req, res) => res.status(410).json({ error: 'fax gateway offline' }));

router.get('/status/:id', (req, res) => res.json({ id: req.params.id, state: 'unknown' }));

module.exports = router;
