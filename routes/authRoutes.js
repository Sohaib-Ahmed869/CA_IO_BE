// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");

const {
  userRegistrationValidation,
  loginValidation,
  initialScreeningValidation,
} = require("../middleware/validation");
const {
  registerUser,
  registerAdmin,
  login,
  getProfile,
  changePassword,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

// Public routes
router.post(
  "/register",
  userRegistrationValidation,
  initialScreeningValidation,
  registerUser
);
router.post("/register-admin", userRegistrationValidation, registerAdmin);
router.post("/login", loginValidation, login);

// Protected routes
router.get("/profile", authenticate, getProfile);

router.put("/change-password", authenticate, changePassword);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
