const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");

const {
  getAllStudents,
  getStudentStats,
  updateStudentStatus,
  updateStudentInfo,
} = require("../controllers/adminStudentController");

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize("admin", "sales_agent"));

// Get all students with filtering and pagination
router.get("/", getAllStudents);

// Get student statistics
router.get("/stats", getStudentStats);

// Update student status
router.put("/:studentId/status", updateStudentStatus);

// Update student information
router.put("/:studentId/info", updateStudentInfo);

module.exports = router;
