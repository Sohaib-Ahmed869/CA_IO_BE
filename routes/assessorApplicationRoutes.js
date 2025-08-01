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
    const FormSubmission = require("../models/formSubmission");

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

    // For each application, get the form submissions
    const applicationsWithForms = await Promise.all(
      applications.map(async (app) => {
        const formSubmissions = await FormSubmission.find({
          applicationId: app._id,
        }).populate("formTemplateId", "name stepNumber filledBy");

        const transformedForms = formSubmissions.map((sub) => {
          if (!sub.formTemplateId) {
            console.error('Null formTemplateId in FormSubmission:', {
              formSubmissionId: sub._id,
              applicationId: sub.applicationId,
              stepNumber: sub.stepNumber,
              filledBy: sub.filledBy,
              status: sub.status,
              submittedAt: sub.submittedAt,
            });
          }
          return {
            stepNumber: sub.stepNumber,
            formTemplateId: sub.formTemplateId ? sub.formTemplateId._id : null,
            formSubmissionId: sub._id,
            submissionId: sub._id,
            title: sub.formTemplateId ? sub.formTemplateId.name : 'Unknown Form',
            status: sub.status,
            submittedAt: sub.submittedAt,
            filledBy: sub.filledBy,
            assessed: sub.assessed,
          };
        });

        return {
          ...app.toObject(),
          formSubmissions: transformedForms,
        };
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
