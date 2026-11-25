const express = require('express');
const router = express.Router();

const CARTS = new Map();

// Read the caller's cart
router.get('/', (req, res) => res.json({ items: CARTS.get(req.user || 'anon') || [] }));

// Add an item to the cart
router.post('/items', (req, res) => res.status(201).json({ ok: true }));

// Remove an item from the cart
router.delete('/items/:id', (req, res) => res.json({ ok: true }));

module.exports = router;
