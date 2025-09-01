// routes/assessorApplicationRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");

// Import the admin controller for now (we'll modify it)
const {
  getAllApplications,
  getApplicationDetails,
  getFormSubmissionDetails,
} = require("../controllers/adminApplicationController");

const { getDocuments } = require("../controllers/documentsUploadController");

// All assessor routes require authentication and assessor role
router.use(authenticate);
router.use(authorize("assessor", "admin"));

router.get("/:applicationId/forms", async (req, res) => {
  // Redirect to the new assessor forms controller
  res.redirect(`/assessor-forms/application/${req.params.applicationId}/forms`);
});
// Get applications assigned to this assessor
router.get("/", async (req, res) => {
  try {
    const assessorId = req.user.id;
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sortBy = "newest",
    } = req.query;

    // Build filter object for assessor's applications
    const filter = {
      isArchived: { $ne: true },
      assignedAssessor: assessorId,
    };

    if (status && status !== "all" && status !== "undefined") {
      filter.overallStatus = status;
    }

    // Build search query (reuse existing logic)
    let searchFilter = {};
    if (search && search.trim() !== "" && search !== "undefined") {
      const User = require("../models/user");
      const users = await User.find({
        $or: [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const userIds = users.map((user) => user._id);
      searchFilter = { userId: { $in: userIds } };
    }

    // Combine filters
    const finalFilter = { ...filter, ...searchFilter };

    // Build sort object
    let sortObject = {};
    switch (sortBy) {
      case "oldest":
        sortObject = { createdAt: 1 };
        break;
      case "dueDate":
        sortObject = { updatedAt: 1 };
        break;
      case "priority":
        sortObject = { overallStatus: 1 };
        break;
      default: // newest
        sortObject = { createdAt: -1 };
    }

    const Application = require("../models/application");
    const { calculateApplicationSteps } = require("../utils/stepCalculator");

    // Get applications
    const applications = await Application.find(finalFilter)
      .populate("userId", "firstName lastName email phoneNumber")
      .populate("certificationId", "name price")
      .populate("assignedAssessor", "firstName lastName")
      .populate("paymentId", "status")
      .populate("documentUploadId", "status documents")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort(sortObject);

    // For each application, attach form step summaries only
    const applicationsWithForms = await Promise.all(
      applications.map(async (app) => {
        let formsSummary = null;
        try {
          const stepData = await calculateApplicationSteps(app._id);
          
          // Get all student-visible steps for total/completed counts (sequential logic)
          const studentSteps = (stepData.steps || []).filter(
            (s) => s.isUserVisible === true || s.actor === "student" || s.actor === "third_party"
          );
          const totalSteps = studentSteps.length;
          const completedSteps = studentSteps.filter((s) => s.isCompleted).length;
          
          // Filter only form steps for form-specific data
          const formSteps = (stepData.steps || []).filter(
            (s) => s.type === "form"
          );
          const totalForms = formSteps.length;
          const completedForms = formSteps.filter((s) => s.isCompleted).length;
          

          
          // Get completed form step numbers using certification's formTemplateIds stepNumber
          const completedFormNumbers = formSteps
            .filter((s) => s.isCompleted)
            .map((s) => s.metadata?.certificationStepNumber || s.stepNumber)
            .sort((a, b) => a - b);
          
          // Get all form step numbers using certification's formTemplateIds stepNumber
          const allFormNumbers = formSteps
            .map((s) => s.metadata?.certificationStepNumber || s.stepNumber)
            .sort((a, b) => a - b);
          
          formsSummary = {
            totalSteps,        // Total sequential steps (payment, forms, documents, evidence, etc.)
            completedSteps,    // Completed sequential steps
            totalForms,        // Total number of forms
            completedForms,    // Completed number of forms
            completedFormNumbers, // Array of completed form numbers [2, 5] - using certification stepNumber
            allFormNumbers, // Array of all form numbers [1, 2, 3, 4, 5] - using certification stepNumber
            formDetails: formSteps.map(step => ({
              stepNumber: step.metadata?.certificationStepNumber || step.stepNumber, // Fallback to sequential stepNumber if certificationStepNumber is undefined
              title: step.title,
              type: step.type,
              isCompleted: step.isCompleted,
              status: step.status,
              actor: step.actor,
              submissionId: step.submissionId, // Required for clicking/viewing submissions
              assessed: step.metadata?.assessed || "pending" // "pending", "approved", "rejected"
            }))
          };
        } catch (e) {
          console.error("Error calculating steps for application:", app._id, e);
          formsSummary = { 
            totalSteps: 0,
            completedSteps: 0,
            totalForms: 0, 
            completedForms: 0, 
            completedFormNumbers: [],
            allFormNumbers: [],
            formDetails: []
          };
        }
        return { ...app.toObject(), forms: formsSummary };
      })
    );

    // Get total count
    const total = await Application.countDocuments(finalFilter);

    res.json({
      success: true,
      data: {
        applications: applicationsWithForms,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    console.error("Get assessor applications error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching assigned applications",
    });
  }
});

// Get documents for an application
router.get("/:applicationId/documents", getDocuments);
// Get specific application for assessment
router.get("/:applicationId", getApplicationDetails);

// Get form submission details
router.get("/form-submission/:submissionId", getFormSubmissionDetails);

// Update assessment notes
router.put("/:applicationId/notes", async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { notes } = req.body;
    const assessorId = req.user.id;

    const Application = require("../models/application");

    const application = await Application.findOneAndUpdate(
      {
        _id: applicationId,
        assignedAssessor: assessorId,
      },
      {
        assessmentNotes: notes,
        lastAssessmentUpdate: new Date(),
      },
      { new: true }
    );

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found or not assigned to you",
      });
    }

    res.json({
      success: true,
      message: "Assessment notes updated successfully",
      data: application,
    });
  } catch (error) {
    console.error("Update assessment notes error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating assessment notes",
    });
  }
});

// Set all form submissions' assessed to true for an application (assessor only)
router.put('/:applicationId/assess', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const assessorId = req.user.id;
    const Application = require("../models/application");
    const FormSubmission = require("../models/formSubmission");

    // Ensure the assessor is assigned to this application
    const application = await Application.findOne({
      _id: applicationId,
      assignedAssessor: assessorId,
    });
    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found or not assigned to you",
      });
    }

    // Update all form submissions for this application
    const result = await FormSubmission.updateMany(
      { applicationId },
      { $set: { assessed: "approved" } }
    );

    res.json({
      success: true,
      message: `Assessment status set to true for ${result.modifiedCount} form(s)`,
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error updating assessment status for forms:", error);
    res.status(500).json({
      success: false,
      message: "Error updating assessment status for forms",
    });
  }
});

module.exports = router;
