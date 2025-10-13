// routes/pdfReportRoutes.js
const express = require("express");
const router = express.Router();
const pdfReportController = require("../controllers/pdfReportController");

// Get student data as JSON
// GET /api/pdf-report/data/:userId
router.get("/data/:userId", pdfReportController.getStudentData);

// Generate student audit report PDF
// GET /api/pdf-report/student/:userId
router.get("/student/:userId", pdfReportController.generateStudentReport);

module.exports = router;
