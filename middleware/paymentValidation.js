// middleware/paymentValidation.js
const { body, validationResult } = require("express-validator");

const paymentValidation = {
  // Validate payment plan creation
  validatePaymentPlan: [
    body("paymentType")
      .isIn(["one_time", "payment_plan"])
      .withMessage("Payment type must be either 'one_time' or 'payment_plan'"),

    body("initialPayment")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Initial payment must be a positive number"),

    body("recurringAmount")
      .if(body("paymentType").equals("payment_plan"))
      .isFloat({ min: 0.01 })
      .withMessage("Recurring amount must be greater than 0 for payment plans"),

    body("frequency")
      .if(body("paymentType").equals("payment_plan"))
      .isIn(["weekly", "fortnightly", "monthly", "custom"])
      .withMessage("Frequency must be weekly, fortnightly, monthly, or custom"),

    body("totalPayments")
      .if(body("paymentType").equals("payment_plan"))
      .isInt({ min: 1, max: 52 })
      .withMessage("Total payments must be between 1 and 52"),

    body("discount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Discount must be a positive number"),

    body("discountType")
      .if(body("discount").exists())
      .isIn(["percentage", "fixed"])
      .withMessage("Discount type must be either 'percentage' or 'fixed'"),

    body("startDate")
      .if(body("paymentType").equals("payment_plan"))
      .isISO8601()
      .toDate()
      .withMessage("Start date must be a valid date"),

    // Custom validation: start date must be in the future
    body("startDate").custom((value, { req }) => {
      if (req.body.paymentType === "payment_plan" && value) {
        const startDate = new Date(value);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (startDate < tomorrow) {
          throw new Error("Start date must be at least tomorrow");
        }
      }
      return true;
    }),

    // Custom validation: discount percentage should not exceed 100%
    body("discount").custom((value, { req }) => {
      if (req.body.discountType === "percentage" && value > 100) {
        throw new Error("Discount percentage cannot exceed 100%");
      }
      return true;
    }),

    // Validation result handler
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }
      next();
    },
  ],

  // Validate discount application
  validateDiscount: [
    body("discount")
      .isFloat({ min: 0.01 })
      .withMessage("Discount must be greater than 0"),

    body("discountType")
      .isIn(["percentage", "fixed"])
      .withMessage("Discount type must be either 'percentage' or 'fixed'"),

    body("reason")
      .notEmpty()
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage("Reason must be between 5 and 500 characters"),

    // Custom validation: discount percentage should not exceed 100%
    body("discount").custom((value, { req }) => {
      if (req.body.discountType === "percentage" && value > 100) {
        throw new Error("Discount percentage cannot exceed 100%");
      }
      return true;
    }),

    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }
      next();
    },
  ],

  // Validate refund request
  validateRefund: [
    body("amount")
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage("Refund amount must be greater than 0"),

    body("reason")
      .notEmpty()
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage("Refund reason must be between 5 and 500 characters"),

    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }
      next();
    },
  ],

  // Validate payment method update
  validatePaymentMethod: [
    body("paymentMethodId")
      .notEmpty()
      .matches(/^pm_[a-zA-Z0-9]+$/)
      .withMessage("Invalid payment method ID format"),

    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }
      next();
    },
  ],

  // Validate payment confirmation
  validatePaymentConfirmation: [
    body("paymentIntentId")
      .notEmpty()
      .matches(/^pi_[a-zA-Z0-9]+$/)
      .withMessage("Invalid payment intent ID format"),

    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }
      next();
    },
  ],

  // Validate cancellation reason
  validateCancellation: [
    body("reason")
      .notEmpty()
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage("Cancellation reason must be between 5 and 500 characters"),

    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }
      next();
    },
  ],
};

module.exports = paymentValidation;
