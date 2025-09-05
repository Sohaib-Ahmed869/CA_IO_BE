// routes/enrolmentFormRoutes.js
const express = require('express');
const router = express.Router();
const enrolmentFormController = require('../controllers/enrolmentFormController');
const { authenticate } = require('../middleware/auth');

// Get the correct enrolment form for an application
router.get(
  '/application/:applicationId/enrolment-form',
  authenticate,
  enrolmentFormController.getEnrolmentForm
);

// Get all forms for an application with correct enrolment form
router.get(
  '/application/:applicationId/forms',
  authenticate,
  enrolmentFormController.getApplicationForms
);

// Update user's international student status
router.put(
  '/international-status',
  authenticate,
  enrolmentFormController.updateInternationalStatus
);

module.exports = router;
