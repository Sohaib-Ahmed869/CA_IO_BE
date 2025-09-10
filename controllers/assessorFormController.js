// controllers/assessorFormController.js
const FormSubmission = require("../models/formSubmission");
const Application = require("../models/application");
const FormTemplate = require("../models/formTemplate");
const User = require("../models/user");

const assessorFormController = {
  // Get forms that assessor needs to fill for an application
  getAssessorForms: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const assessorId = req.user.id;

      // Verify application is assigned to this assessor
      const application = await Application.findOne({
        _id: applicationId,
        assignedAssessor: assessorId,
      })
        .populate({
          path: "certificationId",
          populate: {
            path: "formTemplateIds.formTemplateId",
          },
        })
        .populate("userId", "firstName lastName email");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found or not assigned to you",
        });
      }

      // Get existing assessor form submissions
      const existingSubmissions = await FormSubmission.find({
        applicationId: applicationId,
        filledBy: "assessor",
      });

      // Get student submissions for reference
      const studentSubmissions = await FormSubmission.find({
        applicationId: applicationId,
        filledBy: "user",
        status: { $in: ["submitted", "assessed"] },
      }).populate("formTemplateId", "name stepNumber");

      // Create submission maps
      const assessorSubmissionMap = new Map();
      existingSubmissions.forEach((submission) => {
        assessorSubmissionMap.set(
          submission.formTemplateId.toString(),
          submission
        );
      });

      const studentSubmissionMap = new Map();
      studentSubmissions.forEach((submission) => {
        studentSubmissionMap.set(
          submission.formTemplateId.toString(),
          submission
        );
      });

      // Filter assessor forms
      const assessorForms = application.certificationId.formTemplateIds
        .filter((ft) => ft.filledBy === "assessor")
        .map((formTemplate) => {
          const existingSubmission = assessorSubmissionMap.get(
            formTemplate.formTemplateId._id.toString()
          );

          if (!formTemplate.formTemplateId) {
            console.error('Null formTemplateId in assessorForms:', {
              formTemplate,
              applicationId: application._id,
            });
          }

          // Derive display status for assessor UI
          // Treat any submission that is submitted OR has a submittedAt timestamp as completed
          let derivedStatus = "pending";
          if (existingSubmission) {
            const isCompleted =
              existingSubmission.status === "submitted" ||
              existingSubmission.status === "assessed" ||
              !!existingSubmission.submittedAt;
            if (isCompleted) {
              derivedStatus = "completed";
            } else if (existingSubmission.status === "in_progress") {
              derivedStatus = "in_progress";
            } else {
              derivedStatus = "pending";
            }
          }

          return {
            formTemplate: formTemplate.formTemplateId
              ? {
                  ...formTemplate.formTemplateId.toObject(),
                  id: formTemplate.formTemplateId._id, // Ensure id field is set
                }
              : null,
            stepNumber: formTemplate.stepNumber,
            isRequired: formTemplate.isRequired,
            status: derivedStatus,
            submission: existingSubmission
              ? {
                  id: existingSubmission._id,
                  status: existingSubmission.status,
                  submittedAt: existingSubmission.submittedAt,
                  lastModified: existingSubmission.updatedAt,
                  formData: existingSubmission.formData,
                }
              : null,
          };
        });

      // Sort by step number
      assessorForms.sort((a, b) => a.stepNumber - b.stepNumber);

      res.json({
        success: true,
        data: {
          application: {
            id: application._id,
            overallStatus: application.overallStatus,
            currentStep: application.currentStep,
            student: application.userId,
            certification: application.certificationId,
          },
          assessorForms,
          studentSubmissions: studentSubmissions.map((sub) => ({
            id: sub._id,
            formName: sub.formTemplateId.name,
            stepNumber: sub.formTemplateId.stepNumber,
            submittedAt: sub.submittedAt,
            status: sub.status,
            assessed: sub.assessed,
          })),
        },
      });
    } catch (error) {
      console.error("Get assessor forms error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching assessor forms",
      });
    }
  },

  // Get specific assessor form for filling
  getAssessorFormForFilling: async (req, res) => {
    try {
      const { applicationId, formTemplateId } = req.params;
      const assessorId = req.user.id;

      // Verify application assignment
      const application = await Application.findOne({
        _id: applicationId,
        assignedAssessor: assessorId,
      })
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found or not assigned to you",
        });
      }

      // Get form template
      const formTemplate = await FormTemplate.findById(formTemplateId);
      if (!formTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
        });
      }

      // Verify this is an assessor form
      if (formTemplate.filledBy !== "assessor") {
        return res.status(403).json({
          success: false,
          message: "This form is not for assessors",
        });
      }

      // Get existing assessor submission
      const existingSubmission = await FormSubmission.findOne({
        applicationId,
        formTemplateId,
        filledBy: "assessor",
      });

      // Get all student submissions for context
      const studentSubmissions = await FormSubmission.find({
        applicationId,
        userId: application.userId._id,
        status: { $in: ["submitted", "assessed"] },
      }).populate("formTemplateId", "name stepNumber description");

      // Get other assessor examples for reference (from other applications)
      const referenceSubmissions = await FormSubmission.find({
        formTemplateId,
        filledBy: "assessor",
        status: { $in: ["submitted", "assessed"] },
        applicationId: { $ne: applicationId }, // Exclude current application
      })
        .populate("userId", "firstName lastName")
        .populate({
          path: "applicationId",
          populate: {
            path: "userId",
            select: "firstName lastName",
          },
        })
        .sort({ submittedAt: -1 })
        .limit(3);

      const DocumentUpload = require("../models/documentUpload");
      const { generatePresignedUrl } = require("../config/s3Config");

      const documentUpload = await DocumentUpload.findOne({ applicationId });
      let documentsWithUrls = [];

      if (documentUpload && documentUpload.documents.length > 0) {
        documentsWithUrls = await Promise.all(
          documentUpload.documents.map(async (doc) => {
            try {
              const presignedUrl = await generatePresignedUrl(doc.s3Key, 3600);
              return {
                id: doc._id,
                fileName: doc.fileName,
                originalName: doc.originalName,
                fileSize: doc.fileSize,
                mimeType: doc.mimeType,
                documentType: doc.documentType,
                category: doc.category,
                presignedUrl,
                uploadedAt: doc.uploadedAt,
                isImage: doc.mimeType?.startsWith("image/"),
                isVideo: doc.mimeType?.startsWith("video/"),
                isDocument:
                  !doc.mimeType?.startsWith("image/") &&
                  !doc.mimeType?.startsWith("video/"),
              };
            } catch (error) {
              console.error(`Error generating URL for ${doc.s3Key}:`, error);
              return {
                ...doc.toObject(),
                presignedUrl: null,
                isImage: doc.mimeType?.startsWith("image/"),
                isVideo: doc.mimeType?.startsWith("video/"),
                isDocument:
                  !doc.mimeType?.startsWith("image/") &&
                  !doc.mimeType?.startsWith("video/"),
              };
            }
          })
        );
      }

      res.json({
        success: true,
        data: {
          application: {
            id: application._id,
            student: application.userId,
            certification: application.certificationId,
            overallStatus: application.overallStatus,
          },
          formTemplate: {
            id: formTemplate._id,
            name: formTemplate.name,
            description: formTemplate.description,
            stepNumber: formTemplate.stepNumber,
            filledBy: formTemplate.filledBy,
            formStructure: formTemplate.formStructure,
          },
          existingSubmission: existingSubmission
            ? {
                id: existingSubmission._id,
                formData: existingSubmission.formData,
                status: existingSubmission.status,
                submittedAt: existingSubmission.submittedAt,
                lastModified: existingSubmission.updatedAt,
              }
            : null,
          studentSubmissions: studentSubmissions.map((sub) => ({
            id: sub._id,
            formName: sub.formTemplateId.name,
            stepNumber: sub.formTemplateId.stepNumber,
            formData: sub.formData,
            submittedAt: sub.submittedAt,
          })),
          referenceSubmissions: referenceSubmissions.map((sub) => ({
            id: sub._id,
            assessorName: `${sub.userId?.firstName || "Anonymous"} ${
              sub.userId?.lastName || "Assessor"
            }`,
            studentName: `${
              sub.applicationId?.userId?.firstName || "Student"
            } ${sub.applicationId?.userId?.lastName || ""}`,
            formData: sub.formData,
            submittedAt: sub.submittedAt,
          })),
          studentDocuments: documentsWithUrls,
        },
      });
    } catch (error) {
      console.error("Get assessor form for filling error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form for filling",
      });
    }
  },

  // Submit assessor form
  submitAssessorForm: async (req, res) => {
    try {
      const { applicationId, formTemplateId } = req.params;
      const { formData, status = "submitted" } = req.body;
      const assessorId = req.user.id;

      // Verify application assignment
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

      // Get form template to validate
      const formTemplate = await FormTemplate.findById(formTemplateId);
      if (!formTemplate || formTemplate.filledBy !== "assessor") {
        return res.status(403).json({
          success: false,
          message: "Form template not found or not for assessors",
        });
      }

      // Validate form data against template structure
      const validationResult = validateFormData(
        formData,
        formTemplate.formStructure
      );
      if (!validationResult.isValid) {
        return res.status(400).json({
          success: false,
          message: "Form data validation failed",
          errors: validationResult.errors,
        });
      }

      // Check if submission already exists
      let formSubmission = await FormSubmission.findOne({
        applicationId,
        formTemplateId,
        filledBy: "assessor",
      });

      if (formSubmission) {
        // Update existing submission
        formSubmission.formData = formData;
        formSubmission.status = status;
        if (status === "submitted") {
          formSubmission.submittedAt = new Date();
        }
        await formSubmission.save();
      } else {
        // Create new submission
        formSubmission = await FormSubmission.create({
          applicationId,
          formTemplateId,
          userId: assessorId, // Assessor is the one filling
          stepNumber: formTemplate.stepNumber,
          filledBy: "assessor",
          formData,
          status,
          submittedAt: status === "submitted" ? new Date() : null,
        });
      }

      // Update application progress if form was submitted
      if (status === "submitted") {
        await updateApplicationProgress(applicationId);
      }

      res.json({
        success: true,
        message:
          status === "submitted"
            ? "Assessor form submitted successfully"
            : "Form saved as draft",
        data: {
          submission: {
            id: formSubmission._id,
            status: formSubmission.status,
            submittedAt: formSubmission.submittedAt,
            lastModified: formSubmission.updatedAt,
          },
        },
      });
    } catch (error) {
      console.error("Submit assessor form error:", error);
      res.status(500).json({
        success: false,
        message: "Error submitting assessor form",
      });
    }
  },

  // Get mapping forms (for assessors to view student examples)
  getMappingForms: async (req, res) => {
    try {
      const { formTemplateId } = req.params;
      const assessorId = req.user.id;

      // Get form template
      const formTemplate = await FormTemplate.findById(formTemplateId);
      if (!formTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
        });
      }

      // Get student submissions for this form template for mapping reference
      const studentSubmissions = await FormSubmission.find({
        formTemplateId,
        filledBy: "user",
        status: "submitted",
      })
        .populate("userId", "firstName lastName email")
        .populate("applicationId", "overallStatus")
        .populate({
          path: "applicationId",
          populate: {
            path: "certificationId",
            select: "name",
          },
        })
        .sort({ submittedAt: -1 })
        .limit(20); // Get latest 20 submissions

      // Get assessor submissions for reference
      const assessorSubmissions = await FormSubmission.find({
        formTemplateId,
        filledBy: "assessor",
        status: "submitted",
      })
        .populate("userId", "firstName lastName")
        .populate({
          path: "applicationId",
          populate: [
            { path: "userId", select: "firstName lastName" },
            { path: "certificationId", select: "name" },
          ],
        })
        .sort({ submittedAt: -1 })
        .limit(10);

      res.json({
        success: true,
        data: {
          formTemplate: {
            id: formTemplate._id,
            name: formTemplate.name,
            description: formTemplate.description,
            formStructure: formTemplate.formStructure,
            filledBy: formTemplate.filledBy,
          },
          studentExamples: studentSubmissions.map((sub) => ({
            id: sub._id,
            studentName: `${sub.userId.firstName} ${sub.userId.lastName}`,
            certification: sub.applicationId.certificationId.name,
            formData: sub.formData,
            submittedAt: sub.submittedAt,
            applicationStatus: sub.applicationId.overallStatus,
          })),
          assessorExamples: assessorSubmissions.map((sub) => ({
            id: sub._id,
            assessorName: `${sub.userId.firstName} ${sub.userId.lastName}`,
            studentName: `${sub.applicationId.userId.firstName} ${sub.applicationId.userId.lastName}`,
            certification: sub.applicationId.certificationId.name,
            formData: sub.formData,
            submittedAt: sub.submittedAt,
          })),
        },
      });
    } catch (error) {
      console.error("Get mapping forms error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching mapping forms",
      });
    }
  },

  // Get assessor's form submissions across all applications
  getAssessorSubmissions: async (req, res) => {
    try {
      const assessorId = req.user.id;
      const { page = 1, limit = 10, status, formTemplateId } = req.query;

      const filter = {
        userId: assessorId,
        filledBy: "assessor",
      };

      if (status && status !== "all") {
        filter.status = status;
      }

      if (formTemplateId) {
        filter.formTemplateId = formTemplateId;
      }

      const submissions = await FormSubmission.find(filter)
        .populate("formTemplateId", "name description stepNumber")
        .populate({
          path: "applicationId",
          populate: [
            { path: "userId", select: "firstName lastName email" },
            { path: "certificationId", select: "name" },
          ],
        })
        .sort({ updatedAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await FormSubmission.countDocuments(filter);

      res.json({
        success: true,
        data: {
          submissions: submissions.map((sub) => ({
            id: sub._id,
            formName: sub.formTemplateId.name,
            stepNumber: sub.formTemplateId.stepNumber,
            studentName: `${sub.applicationId.userId.firstName} ${sub.applicationId.userId.lastName}`,
            certification: sub.applicationId.certificationId.name,
            status: sub.status,
            submittedAt: sub.submittedAt,
            lastModified: sub.updatedAt,
            applicationId: sub.applicationId._id,
            formTemplateId: sub.formTemplateId._id,
          })),
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      console.error("Get assessor submissions error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching assessor submissions",
      });
    }
  },
};

// Helper function to validate form data
const validateFormData = (formData, formStructure) => {
  const errors = [];

  formStructure.forEach((field) => {
    if (
      field.required &&
      (!formData[field.fieldName] || formData[field.fieldName] === "")
    ) {
      errors.push(`${field.label} is required`);
    }

    if (field.fieldType === "email" && formData[field.fieldName]) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData[field.fieldName])) {
        errors.push(`${field.label} must be a valid email`);
      }
    }

    if (field.fieldType === "number" && formData[field.fieldName]) {
      if (isNaN(formData[field.fieldName])) {
        errors.push(`${field.label} must be a number`);
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors: errors,
  };
};

// Helper function to update application progress
const updateApplicationProgress = async (applicationId) => {
  try {
    const application = await Application.findById(applicationId).populate({
      path: "certificationId",
      populate: {
        path: "formTemplateIds.formTemplateId",
      },
    });

    if (!application) return;

    // Get all form submissions for this application
    const submissions = await FormSubmission.find({
      applicationId: applicationId,
      status: "submitted",
    });

    // Get required forms
    const requiredForms = application.certificationId.formTemplateIds.filter(
      (ft) => ft.isRequired
    );

    // Check if all required forms are submitted
    const submittedFormIds = new Set(
      submissions.map((sub) => sub.formTemplateId.toString())
    );

    const allRequiredFormsSubmitted = requiredForms.every((rf) =>
      submittedFormIds.has(rf.formTemplateId._id.toString())
    );

    // Update application status if needed
    if (
      allRequiredFormsSubmitted &&
      application.overallStatus === "assessment_pending"
    ) {
      await Application.findByIdAndUpdate(applicationId, {
        overallStatus: "assessment_completed",
        currentStep: Math.max(application.currentStep, 5),
      });
    }
  } catch (error) {
    console.error("Update application progress error:", error);
  }
};

module.exports = assessorFormController;
