// routes/applicationExportRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { exportApplicationsCSV } = require("../controllers/applicationExportController");

router.use(authenticate);

// GET /api/application-exports/csv?status=all&certification=all&assessor=all&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&includeFields=detailed&search=...
router.get('/csv', exportApplicationsCSV);

module.exports = router;



