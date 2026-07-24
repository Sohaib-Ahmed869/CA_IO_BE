const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deactivateUser,
  activateUser,
  resetUserPassword,
  getUserStats,
  getAllowedUserTypesEndpoint,
  getAssessorStats,
  getAssessorActivity,
  getAssessorApplications,
  createStudentByAdmin,
  getAclModules,
  getUserPermissions,
  grantPermission,
  revokePermission,
  assignRole,
  getPermissionSubjects
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

// Activate user (re-enable a deactivated account)
// PATCH /api/user-management/users/:userId/activate
router.patch("/users/:userId/activate", activateUser);

// Reset user password
// POST /api/user-management/users/:userId/reset-password
router.post("/users/:userId/reset-password", resetUserPassword);

// Get user statistics for dashboard
// GET /api/user-management/stats
router.get("/stats", getUserStats);

// Get allowed user types for current user
// GET /api/user-management/allowed-user-types
router.get("/allowed-user-types", getAllowedUserTypesEndpoint);

// ===== Assessor (trainer) overview (Admin with CEO OR Super Admin) =====
// Per-assessor workload stats
// GET /api/user-management/assessors/stats
router.get("/assessors/stats", authorize("admin_with_ceo"), getAssessorStats);

// Assessor activity timeline (who did what, when)
// GET /api/user-management/assessors/activity?days=30&assessorId=<optional>
router.get("/assessors/activity", authorize("admin_with_ceo"), getAssessorActivity);

// One assessor's assigned applications
// GET /api/user-management/assessors/:assessorId/applications
router.get("/assessors/:assessorId/applications", authorize("admin_with_ceo"), getAssessorApplications);

// ===== Permissions & Roles (admin/super_admin) =====
// Catalog of modules/actions (Admin with CEO OR Super Admin)
// GET /api/user-management/acl/modules
router.get("/acl/modules", authorize('admin_with_ceo'), getAclModules);

// Get user's permissions (Admin with CEO OR Super Admin)
// GET /api/user-management/permissions/:userId
router.get("/permissions/:userId", authorize('admin_with_ceo'), getUserPermissions);

// Grant a permission (Admin with CEO OR Super Admin)
// POST /api/user-management/permissions/grant { userId, module, action }
router.post("/permissions/grant", authorize('admin_with_ceo'), grantPermission);

// Revoke a permission (Admin with CEO OR Super Admin)
// POST /api/user-management/permissions/revoke { userId, module, action }
router.post("/permissions/revoke", authorize('admin_with_ceo'), revokePermission);

// Assign a role template (Admin with CEO OR Super Admin)
// POST /api/user-management/roles/assign { userId, role }
router.post("/roles/assign", authorize('admin_with_ceo'), assignRole);

// List ACL subjects filtered by roles (Admin with CEO OR Super Admin)
// GET /api/user-management/permissions/subjects?roles=sales_agent,sales_manager
router.get("/permissions/subjects", authorize('admin_with_ceo'), getPermissionSubjects);

module.exports = router;
