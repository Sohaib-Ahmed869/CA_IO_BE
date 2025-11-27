// controllers/assessorFormController.js
const FormSubmission = require("../models/formSubmission");
const Application = require("../models/application");
const FormTemplate = require("../models/formTemplate");
const User = require("../models/user");
const { getDocumentDisplayName } = require("../utils/documentHelpers");

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
        const key = submission?.formTemplateId
          ? String(submission.formTemplateId)
          : null;
        if (key) assessorSubmissionMap.set(key, submission);
      });

      const studentSubmissionMap = new Map();
      studentSubmissions.forEach((submission) => {
        const key = submission?.formTemplateId
          ? String(submission.formTemplateId)
          : null;
        if (key) studentSubmissionMap.set(key, submission);
      });

      // Filter assessor forms
      const assessorForms = application.certificationId.formTemplateIds
        .filter((ft) => ft.filledBy === "assessor")
        .map((formTemplate) => {
          const tmplId = formTemplate?.formTemplateId?._id
            ? String(formTemplate.formTemplateId._id)
            : null;
          const existingSubmission = tmplId
            ? assessorSubmissionMap.get(tmplId)
            : undefined;

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
          studentSubmissions: studentSubmissions.map((sub) => {
            if (!sub?.formTemplateId) {
              console.warn('[assessorForms] studentSubmission missing formTemplateId', {
                submissionId: String(sub?._id || ''),
                applicationId: String(applicationId || ''),
              });
            }
            return {
              id: sub._id,
              formName: sub?.formTemplateId?.name || 'Unknown Form',
              stepNumber: sub?.formTemplateId?.stepNumber,
              submittedAt: sub.submittedAt,
              status: sub.status,
              assessed: sub.assessed,
            };
          }),
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

      // Allow assessors to access BOTH assessor forms AND student/third-party forms with assessor sections
      let studentSubmission = null;
      let thirdPartySubmission = null;
      if (formTemplate.filledBy === "user") {
        studentSubmission = await FormSubmission.findOne({
          applicationId,
          formTemplateId,
          filledBy: "user",
        });
      } else if (formTemplate.filledBy === "third-party") {
        thirdPartySubmission = await FormSubmission.findOne({
          applicationId,
          formTemplateId,
          filledBy: "third-party",
        });
      }

      // Get existing assessor submission (for assessor-only templates)
      let existingAssessorSubmission = null;
      if (!["user", "third-party"].includes(formTemplate.filledBy)) {
        existingAssessorSubmission = await FormSubmission.findOne({
          applicationId,
          formTemplateId,
          filledBy: "assessor",
        });
      }

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
            const docData =
              typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
            try {
              const presignedUrl = await generatePresignedUrl(docData.s3Key, 3600);
              return {
                id: docData._id,
                fileName: docData.fileName,
                originalName: docData.originalName,
                fileSize: docData.fileSize,
                mimeType: docData.mimeType,
                documentType: docData.documentType,
                category: docData.category,
                displayName: getDocumentDisplayName(docData),
                presignedUrl,
                uploadedAt: docData.uploadedAt,
                isImage: docData.mimeType?.startsWith("image/"),
                isVideo: docData.mimeType?.startsWith("video/"),
                isDocument:
                  !docData.mimeType?.startsWith("image/") &&
                  !docData.mimeType?.startsWith("video/"),
              };
            } catch (error) {
              console.error(`Error generating URL for ${docData.s3Key}:`, error);
              return {
                ...docData,
                displayName: getDocumentDisplayName(docData),
                presignedUrl: null,
                isImage: docData.mimeType?.startsWith("image/"),
                isVideo: docData.mimeType?.startsWith("video/"),
                isDocument:
                  !docData.mimeType?.startsWith("image/") &&
                  !docData.mimeType?.startsWith("video/"),
              };
            }
          })
        );
      }

      // Process form structure - assessors can edit assessor-only fields
      const { processFormStructureForRole, isAssessorOnly } = require('../utils/assessorFieldDetector');
      const userRole = req.user.userType || 'assessor';
      const isSharedSubmissionType = ["user", "third-party"].includes(
        formTemplate.filledBy
      );
      
      // Process structure to mark assessor-only fields as editable
      let processedStructure = processFormStructureForRole(
        formTemplate.formStructure,
        userRole
      );

      // For assessors viewing student/third-party forms, mark non-assessor fields as read-only
      if (isSharedSubmissionType) {
        processedStructure = processedStructure.map(section => {
          const sectionIsAssessorOnly = isAssessorOnly(section);
          
          // If section is not assessor-only, make it read-only for assessors
          if (!sectionIsAssessorOnly) {
            const updatedSection = {
              ...section,
              _editable: false,
              _readOnly: true
            };
            
            // Mark all fields in student sections as read-only
            if (section.fields && Array.isArray(section.fields)) {
              updatedSection.fields = section.fields.map(field => {
                const fieldIsAssessorOnly = isAssessorOnly(field);
                return {
                  ...field,
                  _isAssessorOnly: fieldIsAssessorOnly,
                  _editable: fieldIsAssessorOnly, // Only assessor-only fields are editable
                  _readOnly: !fieldIsAssessorOnly // Student fields are read-only
                };
              });
            }
            
            return updatedSection;
          }
          
          // Assessor-only sections remain editable
          return section;
        });
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
            filledBy: formTemplate.filledBy, // 'user' or 'assessor'
            formStructure: processedStructure, // Processed with editability flags
          },
          // Student's submission data (for reference, read-only)
          studentSubmission: studentSubmission ? {
            id: studentSubmission._id,
            formData: studentSubmission.formData,
            assessorFormData: studentSubmission.assessorFormData || {},
            status: studentSubmission.status,
            submittedAt: studentSubmission.submittedAt,
          } : null,
          thirdPartySubmission: thirdPartySubmission ? {
            id: thirdPartySubmission._id,
            formData: thirdPartySubmission.formData,
            assessorFormData: thirdPartySubmission.assessorFormData || {},
            status: thirdPartySubmission.status,
            submittedAt: thirdPartySubmission.submittedAt,
          } : null,
          // Assessor's submission payload (shared with student submission when applicable)
          existingSubmission:
            formTemplate.filledBy === "user"
              ? (studentSubmission
                  ? {
                      id: studentSubmission._id,
                      formData: studentSubmission.assessorFormData || {},
                      status: studentSubmission.assessorStatus || "draft",
                      submittedAt: studentSubmission.assessorFilledAt,
                      lastModified: studentSubmission.updatedAt,
                    }
                  : null)
              : formTemplate.filledBy === "third-party"
              ? (thirdPartySubmission
                  ? {
                      id: thirdPartySubmission._id,
                      formData: thirdPartySubmission.assessorFormData || {},
                      status: thirdPartySubmission.assessorStatus || "draft",
                      submittedAt: thirdPartySubmission.assessorFilledAt,
                      lastModified: thirdPartySubmission.updatedAt,
                    }
                  : null)
              : (existingAssessorSubmission
                  ? {
                      id: existingAssessorSubmission._id,
                      formData: existingAssessorSubmission.formData,
                      status: existingAssessorSubmission.status,
                      submittedAt: existingAssessorSubmission.submittedAt,
                      lastModified: existingAssessorSubmission.updatedAt,
                    }
                  : null),
          studentSubmissions: studentSubmissions.map((sub) => {
            if (!sub?.formTemplateId) {
              console.warn('[assessorFormForFilling] studentSubmission missing formTemplateId', {
                submissionId: String(sub?._id || ''),
                applicationId: String(applicationId || ''),
              });
            }
            return {
              id: sub._id,
              formName: sub?.formTemplateId?.name || 'Unknown Form',
              stepNumber: sub?.formTemplateId?.stepNumber,
              formData: sub.formData,
              submittedAt: sub.submittedAt,
            };
          }),
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
      if (!formTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
        });
      }

      // Allow assessors to submit for both assessor forms AND student forms with assessor sections
      // Previously only allowed assessor forms, now allow any form assigned to the application

      // Get base submission if this is a shared form
      const studentSubmission =
        formTemplate.filledBy === "user"
          ? await FormSubmission.findOne({
              applicationId,
              formTemplateId,
              filledBy: "user",
            })
          : null;
      const thirdPartySubmission =
        formTemplate.filledBy === "third-party"
          ? await FormSubmission.findOne({
              applicationId,
              formTemplateId,
              filledBy: "third-party",
            })
          : null;

      // Validate that assessor is only submitting assessor-only fields
      const { isAssessorOnly } = require('../utils/assessorFieldDetector');
      
      // Extract only assessor-only fields from submitted formData
      const assessorOnlyFields = {};
      const studentFields = {};
      
      if (Array.isArray(formTemplate.formStructure)) {
        formTemplate.formStructure.forEach(section => {
          const sectionIsAssessorOnly = isAssessorOnly(section);
          
          if (section.fields && Array.isArray(section.fields)) {
            section.fields.forEach(field => {
              const fieldName = field.fieldName || field.id;
              const fieldIsAssessorOnly = sectionIsAssessorOnly || isAssessorOnly(field);
              
              if (formData[fieldName] !== undefined) {
                if (fieldIsAssessorOnly) {
                  assessorOnlyFields[fieldName] = formData[fieldName];
                } else {
                  // Assessor tried to submit a student field - this should be prevented by frontend
                  // But we validate here too for security
                  studentFields[fieldName] = formData[fieldName];
                }
              }
            });
          }
        });
      }

      // If assessor tried to submit student fields, reject
      if (Object.keys(studentFields).length > 0) {
        return res.status(403).json({
          success: false,
          message: "You can only submit assessor-only fields",
          errors: [`Cannot submit student fields: ${Object.keys(studentFields).join(', ')}`]
        });
      }

      // If this is a shared form, prepare combined data for validation
      let combinedFormData = formData;
      if (formTemplate.filledBy === 'user' && studentSubmission) {
        combinedFormData = {
          ...(studentSubmission.formData || {}),
          ...assessorOnlyFields,
        };
      } else if (formTemplate.filledBy === 'third-party' && thirdPartySubmission) {
        combinedFormData = {
          ...(thirdPartySubmission.formData || {}),
          ...assessorOnlyFields,
        };
      }

      // Validate form data against template structure
      const validationResult = validateFormData(
        combinedFormData,
        formTemplate.formStructure
      );
      if (!validationResult.isValid) {
        return res.status(400).json({
          success: false,
          message: "Form data validation failed",
          errors: validationResult.errors,
        });
      }

      let responseSubmissionMeta;

      if (["user", "third-party"].includes(formTemplate.filledBy)) {
        const targetSubmission =
          formTemplate.filledBy === "user" ? studentSubmission : thirdPartySubmission;
        if (!targetSubmission) {
          return res.status(404).json({
            success: false,
            message: "Base submission not found for this form",
          });
        }

        targetSubmission.assessorFormData = {
          ...(targetSubmission.assessorFormData || {}),
          ...assessorOnlyFields,
        };
        targetSubmission.assessorFilledBy = assessorId;
        targetSubmission.assessorStatus = status;
        if (status === "submitted") {
          targetSubmission.assessorFilledAt = new Date();
        }
        targetSubmission.formData = {
          ...(combinedFormData || {}),
        };
        targetSubmission.markModified("assessorFormData");
        targetSubmission.markModified("formData");
        await targetSubmission.save();

        responseSubmissionMeta = {
          id: targetSubmission._id,
          status: targetSubmission.assessorStatus,
          submittedAt: targetSubmission.assessorFilledAt,
          lastModified: targetSubmission.updatedAt,
        };
      } else {
        // Check if assessor submission already exists
        let formSubmission = await FormSubmission.findOne({
          applicationId,
          formTemplateId,
          filledBy: "assessor",
        });

        if (formSubmission) {
          // Update existing assessor submission
          formSubmission.formData = combinedFormData;
          formSubmission.status = status;
          if (status === "submitted") {
            formSubmission.submittedAt = new Date();
          }
          await formSubmission.save();
        } else {
          // Create new assessor submission
          formSubmission = await FormSubmission.create({
            applicationId,
            formTemplateId,
            userId: assessorId, // Assessor is the one filling
            stepNumber: formTemplate.stepNumber,
            filledBy: "assessor",
            formData: combinedFormData, // Use merged data
            status,
            submittedAt: status === "submitted" ? new Date() : null,
          });
        }

        responseSubmissionMeta = {
          id: formSubmission._id,
          status: formSubmission.status,
          submittedAt: formSubmission.submittedAt,
          lastModified: formSubmission.updatedAt,
        };
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
          submission: responseSubmissionMeta,
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
