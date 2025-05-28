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
  updateUserPermissions,
  getAllUsers,
} = require("../controllers/adminController");

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize("admin"));

// Create sales staff
router.post("/sales-manager", createSalesManager);
router.post("/sales-agent", createSalesAgent);

// User management
router.get("/users", getAllUsers);
router.put("/users/:userId/permissions", updateUserPermissions);

module.exports = router;
