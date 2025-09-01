// routes/studentExportRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  exportStudentsCSV,
  exportStudentsExcel,
  exportStudentsPDF,
  exportSingleStudentPDF,
  getExportStats
} = require("../controllers/studentExportController");

// All routes require authentication
router.use(authenticate);

// Get export statistics
// GET /api/student-exports/stats
router.get("/stats", getExportStats);

// Export students as CSV
// GET /api/student-exports/csv?status=all&certification=all&assessor=all&dateFrom=2024-01-01&dateTo=2024-12-31&includeFields=basic
router.get("/csv", exportStudentsCSV);

// Export students as Excel
// GET /api/student-exports/excel?status=all&certification=all&assessor=all&dateFrom=2024-01-01&dateTo=2024-12-31&includeFields=detailed
router.get("/excel", exportStudentsExcel);

// Export students as PDF
// GET /api/student-exports/pdf?status=all&certification=all&assessor=all&dateFrom=2024-01-01&dateTo=2024-12-31&includeFields=detailed
router.get("/pdf", exportStudentsPDF);

// Export single student application as PDF
// GET /api/student-exports/student/:applicationId/pdf
router.get("/student/:applicationId/pdf", exportSingleStudentPDF);

module.exports = router;
