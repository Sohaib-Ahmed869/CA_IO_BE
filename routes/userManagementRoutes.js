const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deactivateUser,
  resetUserPassword,
  getUserStats,
  getAllowedUserTypesEndpoint,
  createStudentByAdmin
} = require("../controllers/userManagementController");

// All routes require authentication and admin/CEO authorization
router.use(authenticate);
router.use(authorize("admin", "super_admin"));

// Create a new user
// POST /api/user-management/users
router.post("/users", createUser);

// Create a new student with random password and email credentials
// POST /api/user-management/users/create-student
router.post("/users/create-student", createStudentByAdmin);

// Get all users with filtering and pagination
// GET /api/user-management/users?page=1&limit=50&userType=admin&search=john&isActive=true&sortBy=createdAt&sortOrder=desc
router.get("/users", getUsers);

// Get user by ID
// GET /api/user-management/users/:userId
router.get("/users/:userId", getUserById);

// Update user
// PUT /api/user-management/users/:userId
router.put("/users/:userId", updateUser);

// Deactivate user (soft delete)
// DELETE /api/user-management/users/:userId
router.delete("/users/:userId", deactivateUser);

// Reset user password
// POST /api/user-management/users/:userId/reset-password
router.post("/users/:userId/reset-password", resetUserPassword);

// Get user statistics for dashboard
// GET /api/user-management/stats
router.get("/stats", getUserStats);

// Get allowed user types for current user
// GET /api/user-management/allowed-user-types
router.get("/allowed-user-types", getAllowedUserTypesEndpoint);

module.exports = router;
