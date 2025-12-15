// routes/financeDashboardRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const financeDashboardController = require("../controllers/financeDashboardController");

// All routes require authentication and admin authorization
router.use(authenticate);
router.use(authorize("admin", "super_admin"));

// Get finance dashboard data
router.get("/", financeDashboardController.getFinanceDashboard);

// Export finance data to CSV
router.get("/export/csv", financeDashboardController.exportFinanceCSV);

module.exports = router;

