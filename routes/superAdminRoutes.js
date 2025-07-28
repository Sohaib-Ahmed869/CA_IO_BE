// routes/superAdminRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, isSuperAdmin } = require("../middleware/auth");
const {
  getSystemStats,
  getUserManagementData,
  updateUserPermissions,
  deleteUser,
} = require("../controllers/superAdminController");

// All routes require super admin authentication
router.use(authenticate);
router.use(isSuperAdmin);

// System statistics
router.get("/stats", getSystemStats);

// User management
router.get("/users", getUserManagementData);
router.put("/users/:userId/permissions", updateUserPermissions);
router.delete("/users/:userId", deleteUser);

module.exports = router; 