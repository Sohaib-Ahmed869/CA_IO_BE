// middleware/validation.js
const { body, validationResult } = require("express-validator");

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation errors",
      errors: errors.array(),
    });
  }
  next();
};

const userRegistrationValidation = [
  body("firstName")
    .trim()
    .notEmpty()
    .withMessage("First name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters"),

  body("lastName")
    .trim()
    .notEmpty()
    .withMessage("Last name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters"),

  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email"),

  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),

  handleValidationErrors,
];

const loginValidation = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email"),

  body("password").notEmpty().withMessage("Password is required"),

  handleValidationErrors,
];

const initialScreeningValidation = [
  body("certificationId")
    .isMongoId()
    .withMessage("Valid certification ID is required"),

  body("workExperienceLocation")
    .trim()
    .notEmpty()
    .withMessage("Work experience location is required"),

  body("currentState")
    .trim()
    .notEmpty()
    .withMessage("Current state is required"),

  body("hasFormalQualifications")
    .isBoolean()
    .withMessage("Formal qualifications field must be true or false"),

  handleValidationErrors,
];

module.exports = {
  userRegistrationValidation,
  loginValidation,
  initialScreeningValidation,
  handleValidationErrors,
};
