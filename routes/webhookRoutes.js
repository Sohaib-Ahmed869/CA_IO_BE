// routes/webhookRoutes.js
const express = require("express");
const router = express.Router();
const { handleStripeWebhook, handleInboundEmail } = require("../controllers/webhookController");

// Stripe webhook endpoint - NO authentication middleware
// Stripe webhooks need raw body, so this should be handled before body parsing
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

// Inbound email webhook - generic JSON (postmark/sendgrid/SES etc.)
router.post("/email", express.json({ limit: '2mb' }), handleInboundEmail);

module.exports = router;
