const express = require('express');
const router = express.Router();

/**
 * Product search directly against the products database.
 *
 * @deprecated Superseded by the dedicated search service: GET /api/v1/search.
 * Older mobile builds (<= 2.9) still call this. Do not remove until the
 * app release 3.1 has fully rolled out — see TICKET-4461.
 */
router.get('/search', (req, res) => res.json({ items: [], q: req.query.q || '' }));

module.exports = router;
