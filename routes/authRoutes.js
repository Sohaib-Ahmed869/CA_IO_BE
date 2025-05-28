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

module.exports = router;
