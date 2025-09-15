// routes/applicationExportRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { exportApplicationsCSV } = require("../controllers/applicationExportController");

console.log("[Routes] application-exports mounted");

router.use(authenticate);

// GET /api/application-exports/csv?status=all&certification=all&assessor=all&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&includeFields=detailed&search=...
router.get('/csv', (req, res, next) => {
  console.log("[Routes] GET /application-exports/csv", { user: req.user && req.user.id, query: req.query });
  return exportApplicationsCSV(req, res, next);
});

module.exports = router;
