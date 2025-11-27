const crypto = require("crypto");
const SurveyFormRequest = require("../models/surveyFormRequest");
const FormTemplate = require("../models/formTemplate");
const User = require("../models/user");
const emailService = require("./emailService2");

const SURVEY_FORM_TEMPLATE_ID = process.env.SURVEY_USER_FORM_ID;
const SURVEY_FORM_PATH = (process.env.SURVEY_FORM_LINK_PATH || "survey-form")
  .replace(/^\/+|\/+$/g, "");
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").replace(
  /\/+$/,
  ""
);

async function resolveSurveyTemplate() {
  if (SURVEY_FORM_TEMPLATE_ID) {
    const template = await FormTemplate.findOne({
      _id: SURVEY_FORM_TEMPLATE_ID,
      isActive: true,
    });
    if (template) {
      return template;
    }
    console.warn(
      "Configured survey form template not found or inactive:",
      SURVEY_FORM_TEMPLATE_ID
    );
  }

  return FormTemplate.findOne({
    filledBy: "survey-user",
    isActive: true,
  }).sort({ updatedAt: -1 });
}

function buildSurveyFormUrl(token) {
  return `${FRONTEND_URL}/${SURVEY_FORM_PATH}/${token}`;
}

async function findOrCreateRequest(applicationId, formTemplateId, userId) {
  const existing = await SurveyFormRequest.findOne({
    applicationId,
    formTemplateId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });

  if (existing) {
    return existing;
  }

  return SurveyFormRequest.create({
    applicationId,
    formTemplateId,
    userId,
    token: crypto.randomBytes(32).toString("hex"),
  });
}

async function issueSurveyFormForApplication(application, userOverride = null) {
  const userId =
    typeof application.userId === "object"
      ? application.userId._id || application.userId
      : application.userId;
  const user =
    userOverride ||
    (await User.findById(userId).select("firstName lastName email"));

  if (!user) {
    throw new Error("User for survey form not found");
  }

  const formTemplate = await resolveSurveyTemplate();
  if (!formTemplate) {
    throw new Error("Survey form template not available");
  }

  const request = await findOrCreateRequest(
    application._id,
    formTemplate._id,
    user._id
  );

  const link = buildSurveyFormUrl(request.token);

  await emailService.sendSurveyFormRequestEmail(
    user,
    formTemplate,
    application,
    link
  );

  request.sentAt = new Date();
  await request.save();

  return request;
}

async function getActiveSurveyRequestByToken(token) {
  return SurveyFormRequest.findOne({
    token,
    status: "pending",
    expiresAt: { $gt: new Date() },
  })
    .populate("formTemplateId")
    .populate({
      path: "userId",
      select: "firstName lastName email",
    })
    .populate({
      path: "applicationId",
      select: "certificationId overallStatus",
    });
}

async function markRequestCompleted(request, submissionId) {
  request.status = "completed";
  request.submittedAt = new Date();
  request.formSubmissionId = submissionId;
  await request.save();
}

module.exports = {
  issueSurveyFormForApplication,
  getActiveSurveyRequestByToken,
  markRequestCompleted,
  buildSurveyFormUrl,
};

