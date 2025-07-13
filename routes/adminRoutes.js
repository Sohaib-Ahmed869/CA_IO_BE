// routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const {
  authenticate,
  authorize,
  checkPermission,
} = require("../middleware/auth");

const {
  createSalesManager,
  createSalesAgent,
  createAssessor,
  updateUserPermissions,
  getAllUsers,
} = require("../controllers/adminController");

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize("admin", "assessor","sales_agent"));

// Create staff
router.post("/sales-manager", createSalesManager);
router.post("/sales-agent", createSalesAgent);
router.post("/assessor", createAssessor);

// User management
router.get("/users", getAllUsers);
router.put("/users/:userId/permissions", updateUserPermissions);

module.exports = router;
