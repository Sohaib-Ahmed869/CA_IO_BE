// routes/initialScreeningRoutes.js
const express = require('express');
const router = express.Router();
const initialScreeningController = require('../controllers/initialScreeningController');
const { authenticate } = require('../middleware/auth');

// Submit initial screening form
router.post(
  '/submit',
  authenticate,
  initialScreeningController.submitInitialScreening
);

// Update initial screening form
router.put(
  '/:screeningFormId',
  authenticate,
  initialScreeningController.updateInitialScreening
);

// Get user's initial screening forms
router.get(
  '/',
  authenticate,
  initialScreeningController.getUserScreeningForms
);

// Get specific initial screening form
router.get(
  '/:screeningFormId',
  authenticate,
  initialScreeningController.getScreeningForm
);

module.exports = router;
