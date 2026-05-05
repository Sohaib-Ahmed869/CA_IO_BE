// controllers/adminApplicationController.js
const Application = require("../models/application");
const User = require("../models/user");
const FormSubmission = require("../models/formSubmission");
const mongoose = require("mongoose");
const { pollTPRInbox } = require("../utils/tprEmailPoller");
const { getDocumentDisplayName } = require("../utils/documentHelpers");


const adminApplicationController = {
  // Get all applications with filtering and pagination
  getAllApplications: async (req, res) => {
    try {
      // TPR IMAP polling disabled per request
      const {
        page = 1,
        limit = 10,
        status,
        search,
        sortBy = "newest",
        assessor,
      } = req.query;

      // Build filter object
      const filter = { isArchived: { $ne: true } }; // Add this line to exclude archived
      if (status && status !== "all" && status !== "undefined") {
        filter.overallStatus = status;
      }

      if (assessor && assessor !== "all" && assessor !== "undefined") {
        filter.assignedAssessor = assessor;
      }

      // Build search query (name, email, phone, full name, appCode, id)
      let searchFilter = {};
      if (search && search.trim() !== "" && search !== "undefined") {
        const term = search.trim();
        const phoneDigits = term.replace(/\D/g, "");
        const phoneRegex = phoneDigits.length >= 3 ? phoneDigits : term;

        const users = await User.find({
          $or: [
            { firstName:  { $regex: term, $options: "i" } },
            { lastName:   { $regex: term, $options: "i" } },
            { email:      { $regex: term, $options: "i" } },
            // Phone search: match on digits-only string; fallback to raw term
            { phoneNumber: { $regex: phoneRegex, $options: "i" } },
            {
              $expr: {
                $regexMatch: {
                  input: { $concat: ["$firstName", " ", "$lastName"] },
                  regex: term,
                  options: "i",
                },
              },
            },
          ],
        }).select("_id");

        const userIds = users.map((user) => user._id);

        const orFilters = [];
        if (userIds.length) {
          orFilters.push({ userId: { $in: userIds } });
        }
        // Allow searching by appCode
        orFilters.push({ appCode: { $regex: term, $options: "i" } });
        // Direct search by ObjectId
        if (mongoose.Types.ObjectId.isValid(term)) {
          orFilters.push({ _id: term });
        }

        if (orFilters.length) {
          searchFilter = { $or: orFilters };
        }
      }

      // Combine filters
      const finalFilter = { ...filter, ...searchFilter };

      // Build sort object
      let sortObject = {};
      switch (sortBy) {
        case "oldest":
          sortObject = { createdAt: 1 };
          break;
        case "progress":
          sortObject = { currentStep: -1 };
          break;
        default: // newest
          sortObject = { createdAt: -1 };
      }

      console.log("Final Filter:", finalFilter);

      // Get applications
      const applications = await Application.find(finalFilter)
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name price")
        .populate("assignedAssessor", "firstName lastName")
        .populate("paymentId", "status")
        .populate("documentUploadId", "status")
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort(sortObject);

      // Get total count
      const total = await Application.countDocuments(finalFilter);

      // Attach student-visible step summaries to each application (student + third-party only)
      const { calculateApplicationSteps } = require("../utils/stepCalculator");
      const applicationsWithSteps = await Promise.all(
        applications.map(async (app) => {
          let stepsSummary = null;
          try {
            const stepData = await calculateApplicationSteps(app._id);
            const studentSteps = (stepData.steps || []).filter(
              (s) => s.isUserVisible === true || s.actor === "student" || s.actor === "third_party"
            );
            const totalSteps = studentSteps.length;
            const completedSteps = studentSteps.filter((s) => s.isCompleted).length;
            const firstIncomplete = studentSteps.find((s) => !s.isCompleted);
            const currentStep = firstIncomplete
              ? firstIncomplete.stepNumber
              : (studentSteps[studentSteps.length - 1]?.stepNumber || 0);
            const progressPercentage = totalSteps > 0
              ? Math.round((completedSteps / totalSteps) * 100)
              : 0;
            stepsSummary = {
              currentStep,
              totalSteps,
              completedSteps,
              progressPercentage,
              steps: studentSteps,
            };
          } catch (e) {
            stepsSummary = { currentStep: 0, totalSteps: 0, completedSteps: 0, progressPercentage: 0, steps: [] };
          }
          return { ...app.toObject(), steps: stepsSummary };
        })
      );

      res.json({
        success: true,
        data: {
          applications: applicationsWithSteps,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      console.error("Get all applications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching applications",
      });
    }
  },

  // Get application statistics
  getApplicationStats: async (req, res) => {
    try {
      // Update this line to exclude archived applications
      const totalApplications = await Application.countDocuments({
        isArchived: { $ne: true },
      });

      const statusCounts = await Application.aggregate([
        // Add this match stage to exclude archived
        { $match: { isArchived: { $ne: true } } },
        {
          $group: {
            _id: "$overallStatus",
            count: { $sum: 1 },
          },
        },
      ]);

      // Update revenue calculation to exclude archived
      const revenueData = await Application.aggregate([
        // Add this match stage to exclude archived
        { $match: { isArchived: { $ne: true } } },
        {
          $lookup: {
            from: "payments",
            localField: "paymentId",
            foreignField: "_id",
            as: "payment",
          },
        },
        {
          $lookup: {
            from: "certifications",
            localField: "certificationId",
            foreignField: "_id",
            as: "certification",
          },
        },
        {
          $match: {
            "payment.status": "completed",
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: { $arrayElemAt: ["$certification.price", 0] },
            },
          },
        },
      ]);

      const stats = {
        total: totalApplications,
        inProgress: 0,
        completed: 0,
        revenue: revenueData[0]?.totalRevenue || 0,
      };

      // Process status counts
      statusCounts.forEach((status) => {
        if (
          status._id === "in_progress" ||
          status._id === "assessment_pending"
        ) {
          stats.inProgress += status.count;
        }
        if (status._id === "certificate_issued" || status._id === "completed") {
          stats.completed += status.count;
        }
      });

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Get application stats error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching application statistics",
      });
    }
  },

  // Get specific application details
  getApplicationDetails: async (req, res) => {
    try {
      // Polling is only executed via explicit poll endpoint; do not poll here
      const { applicationId } = req.params;

      const application = await Application.findById(applicationId)
        .populate("userId", "firstName lastName email phoneCode phoneNumber createdAt")
        .populate("certificationId", "name price description")
        .populate("assignedAssessor", "firstName lastName email")
        .populate("assignedAgent", "firstName lastName email")
        .populate("initialScreeningFormId")
        .populate("paymentId")
        .populate("documentUploadId", "status documents")
        .populate("certificateId");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Get form submissions with populated template info
      const formSubmissions = await FormSubmission.find({
        applicationId: applicationId,
      })
        .populate("formTemplateId", "name stepNumber filledBy")
        .populate("assessorFilledBy", "firstName lastName email");

      // INCLUDE VERIFIER FORMS: Fetch third-party verifier submissions
      const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
      const tprSubmissions = await ThirdPartyFormSubmission.find({
        applicationId: applicationId,
        'verifierSubmission.isSubmitted': true,
      }).populate("verifierFormTemplateId");

      // Transform verifier submissions to match FormSubmission structure
      const verifierFormSubmissions = tprSubmissions
        .filter(tpr => tpr.verifierSubmission?.isSubmitted && tpr.verifierFormTemplateId)
        .map(tpr => ({
          _id: `verifier_${tpr._id}`,
          stepNumber: tpr.stepNumber || 99, // High number so it appears last
          formTemplateId: tpr.verifierFormTemplateId,
          status: "assessed", // Verifier forms are auto-assessed
          submittedAt: tpr.verifierSubmission.submittedAt,
          filledBy: "verifier",
          assessed: "approved",
        }));

      // Combine regular submissions with verifier submissions
      const allSubmissions = [...formSubmissions, ...verifierFormSubmissions];

      // Transform form submissions to match frontend expectations
      const transformedForms = allSubmissions.map((sub) => {
        const isAssessorForm = sub?.filledBy === "assessor";
        const isAssessorCompleted = isAssessorForm && (
          sub?.assessorStatus === "submitted" || !!sub?.assessorFilledAt
        );
        const isSubmitted = sub?.status === "submitted" || !!sub?.submittedAt || isAssessorCompleted;
        const tmpl = sub?.formTemplateId || {};
        // Remove "verifier_" prefix from submission IDs for frontend display
        let submissionId = sub?._id ? sub._id.toString() : null;
        if (submissionId && submissionId.startsWith('verifier_')) {
          submissionId = submissionId.replace('verifier_', '');
        }
        const filler = sub?.assessorFilledBy;
        return {
          stepNumber: sub?.stepNumber,
          formTemplateId: tmpl?._id, // may be undefined if template missing
          formSubmissionId: submissionId, // This is what the frontend needs (without prefix)
          submissionId: submissionId, // Also add this for compatibility (without prefix)
          title: tmpl?.name || "Untitled Form",
          status: sub?.status,
          submittedAt: sub?.submittedAt,
          filledBy: sub?.filledBy,
          // Assessor-form completion metadata (Steps 4–6 are assessor-filled and
          // never go through a separate approval; the act of the assessor filling
          // them IS the completion).
          assessorFilledAt: sub?.assessorFilledAt || null,
          assessorFilledBy: filler
            ? {
                _id: filler._id,
                firstName: filler.firstName,
                lastName: filler.lastName,
                email: filler.email,
              }
            : null,
          assessorStatus: sub?.assessorStatus,
          isAssessorCompleted,
          assessed: isAssessorCompleted
            ? "assessor_completed"
            : (sub?.assessed === true ? "approved" : sub?.assessed || "pending"),
        };
      });

      // Calculate and attach steps data (same as in getAllApplications)
      const { calculateApplicationSteps } = require("../utils/stepCalculator");
      let stepsData = null;
      try {
        const stepResult = await calculateApplicationSteps(applicationId);
        const studentSteps = (stepResult.steps || []).filter(
          (s) => s.isUserVisible === true || s.actor === "student" || s.actor === "third_party"
        );
        const totalSteps = studentSteps.length;
        const completedSteps = studentSteps.filter((s) => s.isCompleted).length;
        const firstIncomplete = studentSteps.find((s) => !s.isCompleted);
        const currentStep = firstIncomplete
          ? firstIncomplete.stepNumber
          : (studentSteps[studentSteps.length - 1]?.stepNumber || 0);
        const progressPercentage = totalSteps > 0
          ? Math.round((completedSteps / totalSteps) * 100)
          : 0;
        stepsData = {
          currentStep,
          totalSteps,
          completedSteps,
          progressPercentage,
          steps: studentSteps,
        };
      } catch (e) {
        console.error("Failed to calculate steps for application detail:", e);
        stepsData = { currentStep: 0, totalSteps: 0, completedSteps: 0, progressPercentage: 0, steps: [] };
      }

      // Convert application to object and add form submissions AND steps
      // Compute TPR verification status: verified if ANY party (employer/reference/combined) verified
      let tprVerificationStatus = 'pending';
      try {
        // Reuse the tprSubmissions fetched above to avoid duplicate query
        const tprs = tprSubmissions.length > 0 ? tprSubmissions : await ThirdPartyFormSubmission.find({ applicationId })
          .select('verification verificationStatus isSameEmail');
        if (tprs && tprs.length) {
          if (tprs.some(t => t.verificationStatus === 'verified')) {
            tprVerificationStatus = 'verified';
          } else if (tprs.some(t => t.verificationStatus === 'rejected')) {
            tprVerificationStatus = 'rejected';
          } else {
            const parts = [];
            for (const t of tprs) {
              parts.push(t.verification?.employer?.status);
              parts.push(t.verification?.reference?.status);
              if (t.isSameEmail) parts.push(t.verification?.combined?.status);
            }
            if (parts.some(s => s === 'verified')) tprVerificationStatus = 'verified';
            else if (parts.some(s => s === 'rejected')) tprVerificationStatus = 'rejected';
          }
        }
      } catch (e) {
        console.warn('Could not compute TPR verification status:', e.message);
        tprVerificationStatus = 'pending';
      }

      // Generate presigned URLs for documents (inline-signed for PDFs)
      let documentsWithUrls = [];
      if (application.documentUploadId && application.documentUploadId.documents) {
        const { generatePresignedUrl, generateInlineSignedUrl } = require("../config/s3Config");
        documentsWithUrls = await Promise.all(
          application.documentUploadId.documents.map(async (doc) => {
            const docData =
              typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
            try {
              const isPdf =
                docData.mimeType === "application/pdf" ||
                /\.pdf$/i.test(docData.originalName || "") ||
                /\.pdf$/i.test(docData.fileName || "");

              // For PDFs, use inline-signed URL so browser/iframe renders instead of downloads
              const presignedUrl = isPdf
                ? await generateInlineSignedUrl(docData.s3Key, {
                    expiresIn: 900,
                    contentType: "application/pdf",
                    contentDisposition: `inline; filename="${(
                      docData.originalName || "document"
                    ).replace(/"/g, "")}"`,
                  })
                : await generatePresignedUrl(docData.s3Key, 3600);

              return {
                ...docData,
                displayName: getDocumentDisplayName(docData),
                presignedUrl,
              };
            } catch (error) {
              console.error(`Error generating URL for ${docData.s3Key}:`, error);
              return {
                ...docData,
                displayName: getDocumentDisplayName(docData),
                presignedUrl: null,
              };
            }
          })
        );
      }

      // Replace documents array with documents that have presigned URLs
      const applicationWithForms = {
        ...application.toObject(),
        formSubmissions: transformedForms, // Replace the array from the model
        steps: stepsData, // Add steps data
        tprVerificationStatus,
      };

      // Update documentUploadId documents with presigned URLs
      if (applicationWithForms.documentUploadId && documentsWithUrls.length > 0) {
        applicationWithForms.documentUploadId.documents = documentsWithUrls;
      }

      res.json({
        success: true,
        data: {
          application: applicationWithForms,
        },
      });
    } catch (error) {
      console.error("Get application details error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching application details",
      });
    }
  },

  // Assign assessor to application
  assignAssessor: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { assessorId } = req.body;

      // Verify assessor exists and has assessor role
      const assessor = await User.findOne({
        _id: assessorId,
        userType: "assessor",
        isActive: true,
      });

      if (!assessor) {
        return res.status(404).json({
          success: false,
          message: "Assessor not found or not active",
        });
      }

      const application = await Application.findByIdAndUpdate(
        applicationId,
        { assignedAssessor: assessorId },
        { new: true }
      )
        .populate("assignedAssessor", "firstName lastName email")
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Send email notifications to both assessor and student
      try {
        const EmailHelpers = require("../utils/emailHelpers");

        // Notify the assessor about the new assignment
        await EmailHelpers.handleAssessorAssignment(
          application.assignedAssessor,
          application.userId,
          application,
          application.certificationId
        );
        console.log(`Assignment notification sent to assessor: ${application.assignedAssessor.email}`);

        // Notify the student about their assigned assessor
        await EmailHelpers.handleStudentAssessorAssignment(
          application.userId,
          application.assignedAssessor,
          application,
          application.certificationId
        );
        console.log(`Assessor assignment notification sent to student: ${application.userId.email}`);

      } catch (emailError) {
        console.error("Failed to send assignment notification emails:", emailError);
        // Don't fail the assignment if email fails
      }

      res.json({
        success: true,
        message: "Assessor assigned successfully",
        data: application,
      });
    } catch (error) {
      console.error("Assign assessor error:", error);
      res.status(500).json({
        success: false,
        message: "Error assigning assessor",
      });
    }
  },

  // Update application status
  updateApplicationStatus: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { status, reason } = req.body;

      const application = await Application.findByIdAndUpdate(
        applicationId,
        {
          overallStatus: status,
          ...(status === "completed" && { completedAt: new Date() }),
        },
        { new: true }
      );

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      res.json({
        success: true,
        message: "Application status updated successfully",
        data: application,
      });
    } catch (error) {
      console.error("Update application status error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating application status",
      });
    }
  },

  // Get available assessors
  getAvailableAssessors: async (req, res) => {
    try {
      const assessors = await User.find({
        userType: "assessor",
        isActive: true,
      }).select("firstName lastName email");

      res.json({
        success: true,
        data: assessors,
      });
    } catch (error) {
      console.error("Get available assessors error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching available assessors",
      });
    }
  },

  // Get available sales agents
  getAvailableAgents: async (req, res) => {
    try {
      const agents = await User.find({
        userType: { $in: ["sales_agent", "sales_manager"] },
        isActive: true,
      }).select("firstName lastName email");

      res.json({
        success: true,
        data: agents,
      });
    } catch (error) {
      console.error("Get available agents error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching available agents",
      });
    }
  },

  // Assign agent to application
  assignAgent: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { agentId } = req.body;

      // Verify agent exists and has correct role
      const agent = await User.findOne({
        _id: agentId,
        userType: { $in: ["sales_agent", "sales_manager"] },
        isActive: true,
      });

      if (!agent) {
        return res.status(404).json({
          success: false,
          message: "Agent not found or not active",
        });
      }

      const application = await Application.findByIdAndUpdate(
        applicationId,
        { assignedAgent: agentId },
        { new: true }
      ).populate("assignedAgent", "firstName lastName email");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      res.json({
        success: true,
        message: "Agent assigned successfully",
        data: application,
      });
    } catch (error) {
      console.error("Assign agent error:", error);
      res.status(500).json({
        success: false,
        message: "Error assigning agent",
      });
    }
  },

  // Update application tracking info
  updateApplicationTracking: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { callAttempts, contactStatus, leadStatus, internalNotes } =
        req.body;

      const updateData = {};
      if (callAttempts !== undefined) updateData.callAttempts = callAttempts;
      if (contactStatus !== undefined) updateData.contactStatus = contactStatus;
      if (leadStatus !== undefined) updateData.leadStatus = leadStatus;
      if (internalNotes !== undefined) updateData.internalNotes = internalNotes;

      const application = await Application.findByIdAndUpdate(
        applicationId,
        updateData,
        { new: true }
      )
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name price")
        .populate("assignedAssessor", "firstName lastName email")
        .populate("assignedAgent", "firstName lastName email");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      res.json({
        success: true,
        message: "Application tracking updated successfully",
        data: application,
      });
    } catch (error) {
      console.error("Update application tracking error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating application tracking",
      });
    }
  },

  getFormSubmissionDetails: async (req, res) => {
    try {
      const { submissionId } = req.params;

      // HANDLE VERIFIER FORMS: Check if this is a verifier form submission
      if (submissionId.startsWith('verifier_')) {
        const tprId = submissionId.replace('verifier_', '');
        const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
        
        const tpr = await ThirdPartyFormSubmission.findById(tprId)
          .populate("verifierFormTemplateId", "name description formStructure stepNumber filledBy")
          .populate("userId", "firstName lastName email")
          .populate("applicationId", "overallStatus");

        if (!tpr || !tpr.verifierSubmission?.isSubmitted) {
          return res.status(404).json({
            success: false,
            message: "Verifier form submission not found",
          });
        }

        // Transform verifier submission to match FormSubmission structure
        // Remove "verifier_" prefix from ID for frontend display
        const cleanSubmissionId = submissionId.startsWith('verifier_') 
          ? submissionId.replace('verifier_', '') 
          : submissionId;
        const responsePayload = {
          _id: cleanSubmissionId, // Return clean ID without prefix
          applicationId: tpr.applicationId,
          formTemplateId: tpr.verifierFormTemplateId,
          userId: tpr.userId,
          formData: tpr.verifierSubmission.formData || {},
          status: "assessed",
          submittedAt: tpr.verifierSubmission.submittedAt,
          filledBy: "verifier",
          assessed: "approved",
          stepNumber: tpr.stepNumber || 99,
          assessedAt: tpr.verification?.verifier?.verifiedAt,
          assessmentNotes: "Automatically assessed upon verifier form submission",
        };

        return res.json({
          success: true,
          data: responsePayload,
        });
      }

      // Regular form submission
      const isValidId = mongoose.Types.ObjectId.isValid(submissionId);
      const submission = isValidId
        ? await FormSubmission.findById(submissionId)
            .populate("formTemplateId", "name description formStructure stepNumber filledBy")
            .populate("userId", "firstName lastName email")
            .populate("applicationId", "overallStatus")
            .populate("assessedBy", "firstName lastName email")
        : null;

      if (!submission) {
        // Fallback: the list endpoint returns verifier-submission ids without the
        // `verifier_` prefix, so a bare id arriving here may actually be a
        // ThirdPartyFormSubmission._id whose verifier form has been submitted.
        if (isValidId) {
          const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
          const tpr = await ThirdPartyFormSubmission.findById(submissionId)
            .populate("verifierFormTemplateId", "name description formStructure stepNumber filledBy")
            .populate("userId", "firstName lastName email")
            .populate("applicationId", "overallStatus");
          if (tpr && tpr.verifierSubmission?.isSubmitted) {
            return res.json({
              success: true,
              data: {
                _id: tpr._id,
                applicationId: tpr.applicationId,
                formTemplateId: tpr.verifierFormTemplateId,
                userId: tpr.userId,
                formData: tpr.verifierSubmission.formData || {},
                status: "assessed",
                submittedAt: tpr.verifierSubmission.submittedAt,
                filledBy: "verifier",
                assessed: "approved",
                stepNumber: tpr.stepNumber || 99,
                assessedAt: tpr.verification?.verifier?.verifiedAt,
                assessmentNotes: "Automatically assessed upon verifier form submission",
              },
            });
          }
        }
        return res.status(404).json({
          success: false,
          message: "Form submission not found",
        });
      }

      // If this is a third-party submission, enrich with employer/reference parts (non-breaking addition)
      let responsePayload = submission.toObject();
      
      // Merge assessor form data with student form data for display
      // This ensures assessor signatures and other assessor-filled fields are visible
      if (responsePayload.assessorFormData && Object.keys(responsePayload.assessorFormData).length > 0) {
        responsePayload.formData = {
          ...(responsePayload.formData || {}),
          ...responsePayload.assessorFormData, // Assessor data overrides student data for same fields
        };
      }
      
      // Normalize step number to dynamic stepCalculator mapping (payment=1, enrolment=2, ...)
      try {
        const { calculateApplicationSteps } = require("../utils/stepCalculator");
        const stepData = await calculateApplicationSteps(submission.applicationId);
        const steps = Array.isArray(stepData?.steps) ? stepData.steps : [];
        // Try to match by formTemplateId stored in step metadata or direct property
        const match = steps.find((s) => {
          const metaId = s?.metadata?.formTemplateId || s?.formTemplateId;
          return metaId && String(metaId) === String(submission.formTemplateId._id);
        }) || steps.find((s) => s.title && s.title === (responsePayload?.formTemplateId?.name || ''));
        if (match && typeof match.stepNumber === 'number') {
          responsePayload.stepNumber = match.stepNumber;
        }
      } catch (_) {}
      try {
        if (submission.filledBy === "third-party") {
          const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
          const tpr = await ThirdPartyFormSubmission.findOne({
            applicationId: submission.applicationId,
            formTemplateId: submission.formTemplateId,
          });
          if (tpr) {
            responsePayload.thirdParty = {
              status: tpr.status,
              employerSubmission: tpr.employerSubmission
                ? {
                    isSubmitted: !!tpr.employerSubmission.isSubmitted,
                    submittedAt: tpr.employerSubmission.submittedAt,
                    formData: tpr.employerSubmission.formData || {},
                  }
                : null,
              referenceSubmission: tpr.referenceSubmission
                ? {
                    isSubmitted: !!tpr.referenceSubmission.isSubmitted,
                    submittedAt: tpr.referenceSubmission.submittedAt,
                    formData: tpr.referenceSubmission.formData || {},
                  }
                : null,
            };
          }
        }
      } catch (e) {
        console.warn("Failed to enrich third-party submission details:", e.message);
      }

      res.json({
        success: true,
        data: responsePayload,
      });
    } catch (error) {
      console.error("Get form submission details error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form submission details",
      });
    }
  },

  // Admin patches individual fields on a submitted form. Only the keys
  // present in formDataPatch / assessorFormDataPatch are mutated; every other
  // field on the submission is left exactly as the student/assessor saved it.
  updateFormSubmissionData: async (req, res) => {
    try {
      const { submissionId } = req.params;
      const { formDataPatch = {}, assessorFormDataPatch = {} } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(submissionId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid submission id",
        });
      }

      const isPlainObject = (v) =>
        v && typeof v === "object" && !Array.isArray(v);
      if (!isPlainObject(formDataPatch) || !isPlainObject(assessorFormDataPatch)) {
        return res.status(400).json({
          success: false,
          message: "formDataPatch and assessorFormDataPatch must be objects",
        });
      }

      const formKeys = Object.keys(formDataPatch);
      const assessorKeys = Object.keys(assessorFormDataPatch);
      if (formKeys.length === 0 && assessorKeys.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No fields to update",
        });
      }

      const submission = await FormSubmission.findById(submissionId);
      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Form submission not found",
        });
      }

      // Reject keys that look unsafe (Mongo operators / prototype pollution).
      const unsafeKey = (k) =>
        typeof k !== "string" ||
        k.length === 0 ||
        k.startsWith("$") ||
        k.includes("\0") ||
        k === "__proto__" ||
        k === "constructor" ||
        k === "prototype";
      const allKeys = [...formKeys, ...assessorKeys];
      const bad = allKeys.find(unsafeKey);
      if (bad !== undefined) {
        return res.status(400).json({
          success: false,
          message: `Invalid field key: ${bad}`,
        });
      }

      // Build a single $set with dotted keys so untouched fields stay intact.
      const setOps = {};
      formKeys.forEach((k) => {
        setOps[`formData.${k}`] = formDataPatch[k];
      });
      assessorKeys.forEach((k) => {
        setOps[`assessorFormData.${k}`] = assessorFormDataPatch[k];
      });

      const updated = await FormSubmission.findByIdAndUpdate(
        submissionId,
        {
          $set: setOps,
          $inc: { version: 1 },
        },
        { new: true }
      )
        .populate("formTemplateId", "name description formStructure stepNumber filledBy")
        .populate("userId", "firstName lastName email")
        .populate("applicationId", "overallStatus")
        .populate("assessedBy", "firstName lastName email");

      // Return a payload shaped the same as getFormSubmissionDetails so the
      // frontend can drop it straight into state.
      const responsePayload = updated.toObject();
      if (
        responsePayload.assessorFormData &&
        Object.keys(responsePayload.assessorFormData).length > 0
      ) {
        responsePayload.formData = {
          ...(responsePayload.formData || {}),
          ...responsePayload.assessorFormData,
        };
      }

      res.json({
        success: true,
        message: "Form fields updated successfully",
        data: responsePayload,
        meta: {
          editedKeys: {
            formData: formKeys,
            assessorFormData: assessorKeys,
          },
        },
      });
    } catch (error) {
      console.error("Update form submission data error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating form submission data",
      });
    }
  },

  archiveApplication: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findByIdAndUpdate(
        applicationId,
        {
          isArchived: true,
          archivedAt: new Date(),
          archivedBy: req.user.id,
        },
        { new: true }
      );

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      res.json({
        success: true,
        message: "Application archived successfully",
        data: application,
      });
    } catch (error) {
      console.error("Archive application error:", error);
      res.status(500).json({
        success: false,
        message: "Error archiving application",
      });
    }
  },

  // Get archived applications
  getArchivedApplications: async (req, res) => {
    try {
      // Trigger TPR inbox poll (no-op if disabled)
      pollTPRInbox && pollTPRInbox();
      const {
        page = 1,
        limit = 10,
        status,
        search,
        sortBy = "newest",
      } = req.query;

      // Build filter object for archived applications
      const filter = { isArchived: true };
      if (status && status !== "all" && status !== "undefined") {
        // Handle completed status to include both "completed" and "certificate_issued"
        if (status === "completed") {
          filter.overallStatus = { $in: ["completed", "certificate_issued"] };
        } else {
          filter.overallStatus = status;
        }
      }

      // Build search query (name, email, phone, full name, appCode, id)
      let searchFilter = {};
      if (search && search.trim() !== "" && search !== "undefined") {
        const term = search.trim();
        const phoneTerm = term.replace(/\D/g, "");

        const users = await User.find({
          $or: [
            { firstName:  { $regex: term, $options: "i" } },
            { lastName:   { $regex: term, $options: "i" } },
            { email:      { $regex: term, $options: "i" } },
            ...(phoneTerm.length >= 2
              ? [{ phoneNumber: { $regex: phoneTerm, $options: "i" } }]
              : [{ phoneNumber: { $regex: term, $options: "i" } }]),
            {
              $expr: {
                $regexMatch: {
                  input: { $concat: ["$firstName", " ", "$lastName"] },
                  regex: term,
                  options: "i",
                },
              },
            },
          ],
        }).select("_id");

        const userIds = users.map((user) => user._id);

        const orFilters = [];
        if (userIds.length) {
          orFilters.push({ userId: { $in: userIds } });
        }
        orFilters.push({ appCode: { $regex: term, $options: "i" } });
        if (mongoose.Types.ObjectId.isValid(term)) {
          orFilters.push({ _id: term });
        }

        if (orFilters.length) {
          searchFilter = { $or: orFilters };
        }
      }

      // Combine filters
      const finalFilter = { ...filter, ...searchFilter };

      // Debug: Log the filter being used
      console.log('Archived applications filter:', JSON.stringify(finalFilter, null, 2));

      // Build sort object
      let sortObject = {};
      switch (sortBy) {
        case "oldest":
          sortObject = { archivedAt: 1 };
          break;
        default: // newest
          sortObject = { archivedAt: -1 };
      }

      // Get archived applications
      const applications = await Application.find(finalFilter)
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name price")
        .populate("archivedBy", "firstName lastName")
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort(sortObject);

      // Get total count
      const total = await Application.countDocuments(finalFilter);

      // Debug: Get status distribution for archived apps
      const statusDistribution = await Application.aggregate([
        { $match: { isArchived: true } },
        { $group: { _id: "$overallStatus", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
      console.log('Archived applications status distribution:', statusDistribution);

      res.json({
        success: true,
        data: {
          applications,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
          debug: {
            filter: finalFilter,
            statusDistribution
          }
        },
      });
    } catch (error) {
      console.error("Get archived applications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching archived applications",
      });
    }
  },

  // Restore archived application
  restoreApplication: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findByIdAndUpdate(
        applicationId,
        {
          isArchived: false,
          archivedAt: undefined,
          archivedBy: undefined,
          restoredAt: new Date(),
          restoredBy: req.user.id,
        },
        { new: true }
      );

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      res.json({
        success: true,
        message: "Application restored successfully",
        data: application,
      });
    } catch (error) {
      console.error("Restore application error:", error);
      res.status(500).json({
        success: false,
        message: "Error restoring application",
      });
    }
  },

  // Get application profit calculation
  getApplicationProfit: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findById(applicationId)
        .populate("certificationId")
        .populate("paymentId");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      const certificationPrice = application.certificationId.price;
      const baseExpense = application.certificationId.baseExpense || 0;
      const paidAmount = application.paymentId?.totalAmount || 0;
      const discount = certificationPrice - paidAmount;
      const profit = paidAmount - baseExpense;

      const profitData = {
        applicationId: application._id,
        certificationName: application.certificationId.name,
        originalPrice: certificationPrice,
        paidAmount: paidAmount,
        discount: discount,
        baseExpense: baseExpense,
        profit: profit,
        profitMargin:
          paidAmount > 0 ? ((profit / paidAmount) * 100).toFixed(2) : 0,
        paymentStatus: application.paymentId?.status || "pending",
      };

      res.json({
        success: true,
        data: profitData,
      });
    } catch (error) {
      console.error("Get application profit error:", error);
      res.status(500).json({
        success: false,
        message: "Error calculating application profit",
      });
    }
  },

  // Lightweight summary for admin board
  getApplicationSummary: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findById(applicationId)
        .populate('paymentId');

      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      // Compute steps using StepCalculator
      let completed = 0;
      let total = 0;
      try {
        const { StepCalculator } = require('../utils/stepCalculator');
        const calc = new StepCalculator(application);
        await calc.calculateSteps();
        const steps = calc.steps || [];
        total = steps.length;
        completed = steps.filter((s) => s.isCompleted).length;
      } catch (e) {
        // Fallback: no steps computed
        completed = 0;
        total = 0;
      }

      return res.json({
        success: true,
        data: {
          applicationId: String(application._id),
          createdAt: application.createdAt,
          overallStatus: application.overallStatus,
          paymentStatus: application.paymentId ? application.paymentId.status : undefined,
          steps: { completed, total },
        },
      });
    } catch (error) {
      console.error('Get application summary error:', error);
      res.status(500).json({ success: false, message: 'Error fetching application summary' });
    }
  },

  // CEO acknowledge application
  ceoAcknowledge: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { notes } = req.body;

      const application = await Application.findByIdAndUpdate(
        applicationId,
        {
          ceoAcknowledged: true,
          ceoAcknowledgedAt: new Date(),
          ceoAcknowledgedBy: req.user.id,
          ceoAcknowledgementNotes: notes || "",
        },
        { new: true }
      ).populate('userId', 'firstName lastName email');

      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      res.json({ success: true, message: 'CEO acknowledgment recorded', data: application });
    } catch (error) {
      console.error('CEO acknowledge error:', error);
      res.status(500).json({ success: false, message: 'Error recording CEO acknowledgment' });
    }
  },

  // CEO revoke acknowledgment
  ceoUnacknowledge: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const application = await Application.findByIdAndUpdate(
        applicationId,
        {
          ceoAcknowledged: false,
          ceoAcknowledgedAt: null,
          ceoAcknowledgedBy: null,
        },
        { new: true }
      );

      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      res.json({ success: true, message: 'CEO acknowledgment revoked', data: application });
    } catch (error) {
      console.error('CEO unacknowledge error:', error);
      res.status(500).json({ success: false, message: 'Error revoking CEO acknowledgment' });
    }
  },
};

module.exports = adminApplicationController;
