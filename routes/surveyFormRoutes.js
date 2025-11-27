const express = require("express");
const router = express.Router();
const surveyFormController = require("../controllers/surveyFormController");

router.get("/form/:token", surveyFormController.getSurveyForm);
router.post("/form/:token/submit", surveyFormController.submitSurveyForm);

module.exports = router;


