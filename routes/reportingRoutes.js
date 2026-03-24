// routes/reportingRoutes.js
const express = require("express");
const router = express.Router();

const { getReportingData } = require("../controllers/reportingController");

// Public route - NO AUTHENTICATION REQUIRED
// Get all reporting data
router.get("/data", getReportingData);

module.exports = router;
