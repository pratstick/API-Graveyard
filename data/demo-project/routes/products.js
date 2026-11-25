const express = require('express');
const router = express.Router();

const STOCK = { 48101: 14, 48102: 0, 48103: 2, 48207: 41 };

// List products
router.get('/', (req, res) => res.json({ items: [], page: Number(req.query.page || 1) }));

// Product detail
router.get('/:id', (req, res) => res.json({ id: req.params.id, stock: STOCK[req.params.id] ?? 0 }));

// Create product (admin)
router.post('/', (req, res) => res.status(201).json({ id: 99999 }));

// Reviews for a product
router.get('/:id/reviews', (req, res) => res.json({ items: [] }));

module.exports = router;
