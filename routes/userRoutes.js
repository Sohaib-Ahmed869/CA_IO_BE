// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authenticate, authorize, isSuperAdmin } = require("../middleware/auth");
const { identifyRTO } = require("../middleware/tenant");

// Apply RTO identification to all routes
router.use(identifyRTO);

// Public routes (for users to view their own profile)
router.get("/profile", authenticate, userController.getUserById);

// Admin routes (for managing users)
router.get("/", authenticate, authorize("admin", "super_admin"), userController.getAllUsers);
router.get("/:userId", authenticate, authorize("admin", "super_admin"), userController.getUserById);
router.post("/", authenticate, authorize("admin", "super_admin"), userController.createUser);
router.put("/:userId", authenticate, authorize("admin", "super_admin"), userController.updateUser);
router.delete("/:userId", authenticate, authorize("admin", "super_admin"), userController.deleteUser);
router.patch("/:userId/restore", authenticate, authorize("admin", "super_admin"), userController.restoreUser);

// User management specific routes
router.put("/:userId/permissions", authenticate, authorize("admin", "super_admin"), userController.updateUserPermissions);
router.put("/:userId/status", authenticate, authorize("admin", "super_admin"), userController.updateUserStatus);
router.put("/:userId/password", authenticate, authorize("admin", "super_admin"), userController.changeUserPassword);

module.exports = router; 