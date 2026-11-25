// OBSOLETE — pre-2019 clipboard sharing, replaced by the share service.
// @last-touched: 2019-06-03
const express = require('express');
const router = express.Router();

// OBSOLETE: replaced by POST /api/v1/share
router.get('/share', (req, res) => res.json({ token: '…' }));

router.get('/share/:token', (req, res) => res.json({ token: req.params.token, body: '' }));

module.exports = router;
