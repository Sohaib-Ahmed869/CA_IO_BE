// routes/adminPaymentRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");

const {
  getAllPayments,
  getPaymentStats,
  getPaymentDetails,
  createCustomPaymentPlan,
  updatePaymentPlan,
  applyDiscount,
  refundPayment,
  cancelPaymentPlan,
  getPaymentAnalytics,
  createPaymentIntentForStudent,
  confirmPaymentForStudent,
  payRemainingBalanceForStudent,
  payNextInstallmentForStudent,
  createSetupIntentForStudent,
  setupPaymentPlanForStudent,
  markPaymentAsPaid,
  markNextInstallmentAsPaid,
  markRemainingInstallmentsAsPaid,
} = require("../controllers/adminPaymentController");

// All admin payment routes require authentication and admin/sales role
router.use(authenticate);
router.use(authorize("admin", "sales_manager", "sales_agent"));

// Get all payments with filtering and pagination
router.get("/", getAllPayments);

// Get payment statistics
router.get("/stats", getPaymentStats);

// Get payment analytics
router.get("/analytics", getPaymentAnalytics);

// Get specific payment details
router.get("/:paymentId", getPaymentDetails);

// Create custom payment plan for application
router.post(
  "/application/:applicationId/payment-plan",
  createCustomPaymentPlan
);

// Update payment plan
router.put("/:paymentId", updatePaymentPlan);

// Apply discount to payment
router.post("/:paymentId/discount", applyDiscount);

// Refund payment
router.post("/:paymentId/refund", refundPayment);

// Cancel payment plan
router.post("/:paymentId/cancel", cancelPaymentPlan);

// Admin creates payment intent for student
router.post(
  "/application/:applicationId/payment-intent",
  createPaymentIntentForStudent
);

// Admin confirms payment for student
router.post("/confirm", confirmPaymentForStudent);

// Admin pays remaining balance for student
router.post(
  "/application/:applicationId/remaining-balance",
  payRemainingBalanceForStudent
);

// Admin pays next installment for student
router.post(
  "/application/:applicationId/next-installment",
  payNextInstallmentForStudent
);

// Admin creates setup intent for student
router.post("/setup-intent", createSetupIntentForStudent);

// Admin sets up payment plan for student
router.post(
  "/application/:applicationId/setup-plan",
  setupPaymentPlanForStudent
);

// Mark whole payment as paid
router.post("/application/:applicationId/mark-paid", markPaymentAsPaid);

// Mark next installment as paid
router.post(
  "/application/:applicationId/mark-next-installment-paid",
  markNextInstallmentAsPaid
);

// Mark remaining installments as paid
router.post(
  "/application/:applicationId/mark-remaining-paid",
  markRemainingInstallmentsAsPaid
);

module.exports = router;
