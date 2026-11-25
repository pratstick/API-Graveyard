const express = require('express');
const router = express.Router();

// Nightly aggregated sales report. Was wired into a CEO dashboard that was
// replaced by Metabase in 2024; the URL never made it into the new tool.
router.get('/daily', (req, res) => res.json({ rows: [] }));

// Ad-hoc report export. The UI link was removed before launch; endpoint stayed.
router.get('/export', (req, res) => res.status(501).json({ error: 'not implemented' }));

module.exports = router;
