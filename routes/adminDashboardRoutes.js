// routes/adminDashboardRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");

const {
  getDashboardStats,
  getApplicationTrends,
  getPaymentOverview,
} = require("../controllers/adminDashboardController");

// All routes require authentication
router.use(authenticate);

// Allow admin, assessor, and sales_agent access
router.use(authorize("admin", "assessor", "sales_agent"));

// Get comprehensive dashboard statistics
// GET /api/admin-dashboard/stats?period=month
router.get("/stats", getDashboardStats);

// Get application trends over time
// GET /api/admin-dashboard/trends?period=weekly&periods=12
router.get("/trends", getApplicationTrends);

// Get detailed payment overview (admin and assessor only)
// GET /api/admin-dashboard/payments?period=month
router.get("/payments", authorize("admin", "assessor"), getPaymentOverview);

module.exports = router;
