const express = require('express');
const router = express.Router();

// Full-text product search (dedicated search service)
router.get('/', (req, res) => res.json({ items: [], q: req.query.q || '' }));

module.exports = router;
