const express = require('express');
const router = express.Router();

/**
 * Send a transactional email via the legacy SMTP bridge.
 *
 * @deprecated Use the notifications service (POST /api/v1/notifications) instead.
 * Still called by the storefront and two nightly batch jobs — see TICKET-4471
 * before removing this route.
 */
router.post('/send', (req, res) => res.json({ queued: true }));

module.exports = router;
