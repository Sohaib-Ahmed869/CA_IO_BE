// routes/assessorApplicationRoutes.js
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const Application = require("../models/application");
const FormSubmission = require("../models/formSubmission");

// Import the admin controller for now (we'll modify it)
const {
  getAllApplications,
  getApplicationDetails,
  getFormSubmissionDetails,
} = require("../controllers/adminApplicationController");

const { getDocuments } = require("../controllers/documentsUploadController");
const {
  getApplicationStatsSummary,
} = require("../controllers/assessorDashboardController");

// All assessor routes require authentication and assessor role
router.use(authenticate);
router.use(authorize("assessor", "admin"));

router.get("/:applicationId/forms", async (req, res) => {
  // Redirect to the new assessor forms controller
  res.redirect(`/assessor-forms/application/${req.params.applicationId}/forms`);
});
// Stats summary for assessor applications
router.get("/stats", getApplicationStatsSummary);

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

    const assessorObjectId = mongoose.Types.ObjectId.isValid(assessorId)
      ? new mongoose.Types.ObjectId(assessorId)
      : null;

    // Build filter object for assessor's applications
    const filter = {
      isArchived: { $ne: true },
    };

    if (assessorObjectId) {
      filter.assignedAssessor = assessorObjectId;
    } else {
      // If assessor id is invalid, return empty result set
      return res.json({
        success: true,
        data: {
          applications: [],
          pagination: {
            current: parseInt(page),
            pages: 0,
            total: 0,
          },
        },
      });
    }

    let normalizedStatus = null;
    let statusRequiresPendingForms = false;
    if (status && status !== "all" && status !== "undefined") {
      normalizedStatus = status.toString().toLowerCase().trim();
      const statusMap = {
        assessment_pending: "assessment_pending",
        pending: "assessment_pending",
        "assessment-pending": "assessment_pending",

        assessment_under_review: "under_review",
        under_review: "under_review",
        underreview: "under_review",
        "assessment-under-review": "under_review",
        "assessment under review": "under_review",

        assessment_in_progress: "in_progress",
        in_progress: "in_progress",
        inprogress: "in_progress",
        "assessment-in-progress": "in_progress",
        "assessment in progress": "in_progress",

        assessment_completed: "assessment_completed",
        completed: "assessment_completed",
        "assessment-completed": "assessment_completed",
      };

      const canonicalStatus = statusMap[normalizedStatus] || normalizedStatus;
      if (canonicalStatus === "assessment_pending") {
        statusRequiresPendingForms = true;
      } else {
        const regexPattern =
          "^" +
          escapeRegex(canonicalStatus)
            .replace(/_/g, "[\\s_-]+")
            .replace(/\s+/g, "[\\s_-]+") +
          "$";
        filter.overallStatus = { $regex: new RegExp(regexPattern, "i") };
      }
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

    if (statusRequiresPendingForms) {
      const baseFilterForIds = { ...finalFilter };
      delete baseFilterForIds.overallStatus;

      const candidateIds = await Application.find(baseFilterForIds).distinct("_id");
      if (!candidateIds || candidateIds.length === 0) {
        return res.json({
          success: true,
          data: {
            applications: [],
            pagination: {
              current: parseInt(page),
              pages: 0,
              total: 0,
            },
          },
        });
      }

      // Match stats logic: combine pending form submissions AND applications with pending statuses
      const [pendingFormApplicationIds, pendingStatusApplicationIds] = await Promise.all([
        FormSubmission.distinct("applicationId", {
          applicationId: { $in: candidateIds },
          status: "submitted",
          assessed: { $in: [null, "pending"] },
          filledBy: { $ne: "assessor" },
        }),
        Application.distinct("_id", {
          _id: { $in: candidateIds },
          overallStatus: { $in: ["assessment_pending", "under_review", "in_progress"] },
        }),
      ]);

      // Combine both sets (union)
      const pendingAssessmentSet = new Set([
        ...(pendingFormApplicationIds || []).map((id) => id.toString()),
        ...(pendingStatusApplicationIds || []).map((id) => id.toString()),
      ]);

      if (pendingAssessmentSet.size === 0) {
        return res.json({
          success: true,
          data: {
            applications: [],
            pagination: {
              current: parseInt(page),
              pages: 0,
              total: 0,
            },
          },
        });
      }

      finalFilter._id = { $in: Array.from(pendingAssessmentSet).map(id => new mongoose.Types.ObjectId(id)) };
    }

    console.log("Assessor applications filter:", {
      assessor: assessorObjectId?.toString(),
      statusParam: status,
      normalizedStatus,
      resolvedStatus: filter.overallStatus,
      hasSearchFilter: Object.keys(searchFilter).length > 0,
      statusRequiresPendingForms,
      finalFilter,
    });

    // Build sort object  s
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
      { 
        $set: { 
          assessed: "approved",
          status: "assessed",
          assessedAt: new Date(),
          assessedBy: assessorId
        } 
      }
    );

    // Update application progress and check for survey trigger
    try {
      const assessmentController = require("../controllers/assessmentController");
      await assessmentController.updateApplicationAssessmentProgress(applicationId);
      await assessmentController.checkAndTriggerSurveyEmail(applicationId);
    } catch (progressError) {
      console.error("Error updating application progress:", progressError);
      // Don't fail the request if progress update fails
    }

    res.json({
      success: true,
      message: `Assessment status set to approved for ${result.modifiedCount} form(s)`,
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
