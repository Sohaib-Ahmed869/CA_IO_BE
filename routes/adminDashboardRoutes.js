// routes/adminDashboardRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");

const {
  getDashboardStats,
  getApplicationTrends,
  getPaymentOverview,
} = require("../controllers/adminDashboardController");

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize("admin"));

// Get comprehensive dashboard statistics
// GET /api/admin-dashboard/stats?period=month
router.get("/stats", getDashboardStats);

// Get application trends over time
// GET /api/admin-dashboard/trends?period=weekly&periods=12
router.get("/trends", getApplicationTrends);

// Get detailed payment overview
// GET /api/admin-dashboard/payments?period=month
router.get("/payments", getPaymentOverview);

module.exports = router;
