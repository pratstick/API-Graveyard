const express = require('express');
const router = express.Router();

// Place an order
router.post('/', (req, res) => res.status(201).json({ id: 70001 }));

// Order detail
router.get('/:id', (req, res) => res.json({ id: req.params.id, state: 'shipped' }));

// Legacy thermal-printer receipt feed; only the warehouse kiosk calls it,
// and the kiosk was decommissioned with the old fulfilment centre.
router.get('/:id/receipt', (req, res) => res.type('text').send('RECEIPT…'));

// Export order as PDF — UI link was built ("COMING SOON") but the page never shipped.
router.get('/export/pdf', (req, res) => res.status(501).json({ error: 'not implemented' }));

module.exports = router;
