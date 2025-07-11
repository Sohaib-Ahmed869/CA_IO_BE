// routes/studentPaymentRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");

const {
  getPaymentForApplication,
  createPaymentIntent,
  confirmPayment,
  setupPaymentPlan,
  getPaymentHistory,
  getPaymentMethods,
  updatePaymentMethod,
  cancelPaymentPlan,
  getNextPaymentInfo,
  getPaymentSummary,
  createSetupIntent,
  payRemainingBalance,
  payNextInstallment,
} = require("../controllers/studentPaymentController");

// All student payment routes require authentication
router.use(authenticate);

// Get payment details for specific application
router.get("/application/:applicationId", getPaymentForApplication);

// Create payment intent for one-time payment
router.post("/application/:applicationId/payment-intent", createPaymentIntent);

// Confirm payment success
router.post("/confirm", confirmPayment);

// Setup payment plan with payment method
router.post("/application/:applicationId/setup-plan", setupPaymentPlan);

router.get("/application/:applicationId/summary", getPaymentSummary);

// Get user's payment history
router.get("/history", getPaymentHistory);

// Get user's saved payment methods
router.get("/payment-methods", getPaymentMethods);

// Update payment method for existing payment
router.put("/:paymentId/payment-method", updatePaymentMethod);

// Cancel payment plan (student initiated)
router.post("/:paymentId/cancel", cancelPaymentPlan);

// Get next payment info
router.get("/:paymentId/next-payment", getNextPaymentInfo);

// Create setup intent for saving payment methods
router.post("/setup-intent", createSetupIntent);

router.post('/:applicationId/remaining-balance', payRemainingBalance);
router.post('/:applicationId/next-installment', payNextInstallment);

module.exports = router;
