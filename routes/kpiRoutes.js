// routes/kpiRoutes.js
const express = require("express");
const router = express.Router();
const kpiController = require("../controllers/kpiController");

// Get all KPIs (no authentication required)
// GET /api/kpis?period=lastWeek
// GET /api/kpis?period=lastMonth
router.get("/", kpiController.getAllKPIs);

module.exports = router;
