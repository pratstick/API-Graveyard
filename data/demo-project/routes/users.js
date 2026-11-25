const express = require('express');
const router = express.Router();

const PROFILES = new Map();

// Fetch a user profile
router.get('/:id', (req, res) => res.json(PROFILES.get(req.params.id) || { id: req.params.id }));

// Update a user profile
router.put('/:id', (req, res) => res.json({ ok: true }));

module.exports = router;
