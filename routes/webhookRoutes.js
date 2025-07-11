// routes/webhookRoutes.js
const express = require("express");
const router = express.Router();
const { handleStripeWebhook } = require("../controllers/webhookController");

// Stripe webhook endpoint - NO authentication middleware
// Stripe webhooks need raw body, so this should be handled before body parsing
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

module.exports = router;
