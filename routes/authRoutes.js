// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize, isSuperAdmin } = require("../middleware/auth");

const {
  userRegistrationValidation,
  loginValidation,
  initialScreeningValidation,
} = require("../middleware/validation");
const {
  registerUser,
  registerAdmin,
  registerSuperAdmin,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  getAllUsers,
  updateUserStatus,
} = require("../controllers/authController");

// Public routes
router.post(
  "/register",
  userRegistrationValidation,
  initialScreeningValidation,
  registerUser
);
router.post("/register-admin", userRegistrationValidation, registerAdmin);
router.post("/register-super-admin", userRegistrationValidation, registerSuperAdmin);
router.post("/login", loginValidation, login);

// Protected routes
router.post("/logout", authenticate, logout);
router.get("/profile", authenticate, getProfile);
router.put("/profile", authenticate, updateProfile);
router.put("/change-password", authenticate, changePassword);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Super Admin routes
router.get("/users", authenticate, isSuperAdmin, getAllUsers);
router.put("/users/:userId/status", authenticate, isSuperAdmin, updateUserStatus);

module.exports = router;
