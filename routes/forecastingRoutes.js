// routes/forecastingRoutes.js
const express = require("express");
const router = express.Router();
const forecastingController = require("../controllers/forecastingController");
const { authenticate, authorize } = require("../middleware/auth");

// Apply authentication middleware to all routes
router.use(authenticate);
router.use(authorize("admin", "sales_agent"));

// Main forecasting dashboard data
// GET /api/forecasting/dashboard?period=monthly&year=2024&month=1&quarter=1
router.get("/dashboard", forecastingController.getForecastingData);

// Revenue trends over time
// GET /api/forecasting/trends?period=monthly&periods=12
router.get("/trends", forecastingController.getRevenueTrends);

// Certification-wise forecasting
// GET /api/forecasting/certifications?period=monthly
router.get("/certifications", forecastingController.getCertificationForecast);

// Payment method analytics
// GET /api/forecasting/payment-methods?period=monthly
router.get("/payment-methods", forecastingController.getPaymentMethodAnalytics);

router.get("/profit-analysis", forecastingController.getProfitAnalysis);

module.exports = router;
