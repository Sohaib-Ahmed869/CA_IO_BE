const Application = require("../models/application");
const FormSubmission = require("../models/formSubmission");
const Certification = require("../models/certification");
const InitialScreeningForm = require("../models/initialScreeningForm");
const User = require("../models/user");

const applicationController = {
  // Get user's applications
  getUserApplications: async (req, res) => {
    try {
      const userId = req.user._id;

      const applications = await Application.find({ userId })
        .populate("certificationId", "name description price")
        .populate("initialScreeningFormId")
        .populate("paymentId")
        .sort({ createdAt: -1 });

      console.log("User applications:", applications);

      res.json({
        success: true,
        data: applications,
      });
    } catch (error) {
      console.error("Get user applications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching applications",
      });
    }
  },

  // Get applications with dynamic step summaries (role-aware) and pagination
  getUserApplicationsWithSteps: async (req, res) => {
    try {
      const userId = req.user._id;
      const userType = req.user.userType;
      const { page = 1, limit = 25, sortBy = "newest" } = req.query;

      // Scope by role
      let query = {};
      if (userType === "admin" || userType === "super_admin") {
        query = {}; // all applications
      } else if (userType === "assessor") {
        query = { assignedAssessor: userId };
      } else {
        query = { userId };
      }

      // Sort
      let sort = { createdAt: -1 };
      if (sortBy === "oldest") sort = { createdAt: 1 };

      const numericPage = Math.max(parseInt(page, 10) || 1, 1);
      const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
      const skip = (numericPage - 1) * numericLimit;

      const [total, applications] = await Promise.all([
        Application.countDocuments(query),
        Application.find(query)
          .populate("certificationId", "name description price")
          .sort(sort)
          .skip(skip)
          .limit(numericLimit),
      ]);

      const { calculateApplicationSteps } = require("../utils/stepCalculator");

      const results = await Promise.all(
        applications.map(async (app) => {
          const stepData = await calculateApplicationSteps(app._id);

          // Always filter to student-visible only (user + third-party)
          const studentSteps = (stepData.steps || []).filter(
            (s) => s.isUserVisible === true || s.actor === "student" || s.actor === "third_party"
          );
          const total = studentSteps.length;
          const completed = studentSteps.filter((s) => s.isCompleted).length;
          const firstIncomplete = studentSteps.find((s) => !s.isCompleted);
          const current = firstIncomplete ? firstIncomplete.stepNumber : (studentSteps[studentSteps.length - 1]?.stepNumber || 0);
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          const stepsPayload = {
            currentStep: current,
            totalSteps: total,
            completedSteps: completed,
            progressPercentage: pct,
            steps: studentSteps,
          };

          return {
            application: {
              _id: app._id,
              certificationId: app.certificationId,
              overallStatus: app.overallStatus,
              createdAt: app.createdAt,
            },
            steps: stepsPayload,
          };
        })
      );

      res.json({
        success: true,
        data: results,
        meta: {
          page: numericPage,
          limit: numericLimit,
          total,
          totalPages: Math.ceil(total / numericLimit) || 0,
          sortBy,
        },
      });
    } catch (error) {
      console.error("Get user applications with steps error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching applications with steps",
      });
    }
  },

  // Get specific application
  getApplicationById: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user._id;

      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
      })
        .populate("certificationId")
        .populate("initialScreeningFormId")
        .populate("paymentId");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      res.json({
        success: true,
        data: application,
      });
    } catch (error) {
      console.error("Get application error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching application",
      });
    }
  },

  // Add after getApplicationById method
  createNewApplication: async (req, res) => {
    try {
      const userId = req.user._id;
      const { certificationId } = req.body;

      // Verify certification exists
      const certification = await Certification.findById(certificationId);
      if (!certification) {
        return res.status(404).json({
          success: false,
          message: "Certification not found",
        });
      }

      // Create new application
      const application = await Application.create({
        userId: userId,
        certificationId: certificationId,
        overallStatus: "initial_screening",
        currentStep: 1,
      });

      // Populate the response
      const populatedApplication = await Application.findById(application._id)
        .populate("certificationId", "name description price")
        .populate("userId", "firstName lastName email");

      res.status(201).json({
        success: true,
        message: "New application created successfully",
        data: populatedApplication,
      });
    } catch (error) {
      console.error("Create new application error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating new application",
      });
    }
  },
    

  // Get available certifications for new applications
  getAvailableCertifications: async (req, res) => {
    try {
      const userId = req.user._id;

      // Get all active certifications
      const allCertifications = await Certification.find({
        isActive: true,
      }).select("name description price");

      // Get user's active applications
      const userActiveApplications = await Application.find({
        userId: userId,
        overallStatus: {
          $nin: ["completed", "rejected", "certificate_issued"],
        },
      }).select("certificationId");

      res.json({
        success: true,
        data: {
          available: allCertifications,
          totalCertifications: allCertifications.length,
          userActiveApplications: userActiveApplications.length,
        },
      });
    } catch (error) {
      console.error("Get available certifications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching available certifications",
      });
    }
  },
  createApplicationWithScreening: async (req, res) => {
    try {
      const userId = req.user._id;
      const {
        certificationId,
        workExperienceYears,
        workExperienceLocation,
        currentState,
        hasFormalQualifications,
        formalQualificationsDetails,
        international_student,
      } = req.body;

      // Verify certification exists
      const certification = await Certification.findById(certificationId);
      if (!certification) {
        return res.status(404).json({
          success: false,
          message: "Certification not found",
        });
      }

      // Create initial screening form
      const InitialScreeningForm = require("../models/initialScreeningForm");
      const initialScreeningForm = await InitialScreeningForm.create({
        userId: userId,
        certificationId: certificationId,
        workExperienceYears,
        workExperienceLocation,
        currentState,
        hasFormalQualifications,
        formalQualificationsDetails: formalQualificationsDetails || "",
        international_student: international_student || false,
        status: "submitted",
        submittedAt: new Date(),
      });

      // Update user profile with international_student flag
      await User.findByIdAndUpdate(userId, {
        international_student: international_student || false
      });

      // Create application
      const application = await Application.create({
        userId: userId,
        certificationId: certificationId,
        initialScreeningFormId: initialScreeningForm._id,
        overallStatus: "payment_pending",
        currentStep: 1,
      });

      // AUTO CREATE ONE-TIME PAYMENT - ADD THIS SECTION
      const Payment = require("../models/payment");
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

      // Get user details for Stripe customer
      const user = await User.findById(userId);

      // Create or get Stripe customer
      let customer;
      try {
        const existingCustomers = await stripe.customers.list({
          email: user.email,
          limit: 1,
        });

        if (existingCustomers.data.length > 0) {
          customer = existingCustomers.data[0];
        } else {
          customer = await stripe.customers.create({
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            phone: user.phoneNumber,
          });
        }
      } catch (stripeError) {
        console.error("Stripe customer error:", stripeError);
        // Continue without Stripe customer - can be created later
      }

      // Create default one-time payment
      const payment = await Payment.create({
        userId: userId,
        applicationId: application._id,
        certificationId: certificationId,
        paymentType: "one_time",
        totalAmount: certification.price,
        status: "pending",
        stripeCustomerId: customer?.id,
        metadata: {
          autoCreated: true,
          originalPrice: certification.price,
        },
      });

      // Update application with payment ID
      await Application.findByIdAndUpdate(application._id, {
        paymentId: payment._id,
      });

      // Populate the response
      const populatedApplication = await Application.findById(application._id)
        .populate("certificationId", "name description price")
        .populate("initialScreeningFormId")
        .populate("paymentId");

      res.status(201).json({
        success: true,
        message: "Application with initial screening created successfully",
        data: {
          application: populatedApplication,
          initialScreeningForm: initialScreeningForm,
          payment: payment, // Include payment in response
        },
      });
    } catch (error) {
      console.error("Create application with screening error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating application with initial screening",
        error: error.message,
        details: error.stack
      });
    }
  },

  getApplicationWithCertificate: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user._id;

      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
      })
        .populate("certificationId")
        .populate("initialScreeningFormId")
        .populate("paymentId");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Include certificate information if available
      let certificateInfo = null;
      if (application.finalCertificate && application.finalCertificate.s3Key) {
        certificateInfo = {
          certificateNumber: application.finalCertificate.certificateNumber,
          uploadedAt: application.finalCertificate.uploadedAt,
          expiryDate: application.finalCertificate.expiryDate,
          grade: application.finalCertificate.grade,
          notes: application.finalCertificate.notes,
          originalName: application.finalCertificate.originalName,
          isExpired: application.finalCertificate.expiryDate
            ? new Date() > application.finalCertificate.expiryDate
            : false,
          daysUntilExpiry: application.finalCertificate.expiryDate
            ? Math.ceil(
                (application.finalCertificate.expiryDate - new Date()) /
                  (1000 * 60 * 60 * 24)
              )
            : null,
        };
      }

      res.json({
        success: true,
        data: {
          ...application.toObject(),
          certificateInfo,
        },
      });
    } catch (error) {
      console.error("Get application with certificate error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching application",
      });
    }
  },

  // Get application progress with dynamic steps
  getApplicationProgress: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user._id;

      // Verify application belongs to user
      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Calculate dynamic steps
      const { calculateApplicationSteps } = require("../utils/stepCalculator");
      const progressData = await calculateApplicationSteps(applicationId);

      res.json({
        success: true,
        data: {
          applicationId,
          ...progressData,
        },
      });
    } catch (error) {
      console.error("Get application progress error:", error);
      res.status(500).json({
        success: false,
        message: "Error calculating application progress",
      });
    }
  },

  // Get dynamic steps for an application
  getApplicationSteps: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { actor } = req.query; // optional: "student" | "assessor" | "admin" | "third_party"
      const userId = req.user._id;

      // Verify application belongs to user (for students) or user is admin/assessor
      const application = await Application.findById(applicationId);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Check permissions
      const isOwner = application.userId.toString() === userId.toString();
      const isAdminOrAssessor = req.user.userType === "admin" || req.user.userType === "assessor" || req.user.userType === "super_admin";
      const isAssignedAssessor = application.assignedAssessor && application.assignedAssessor.toString() === userId.toString();

      if (!isOwner && !isAdminOrAssessor && !isAssignedAssessor) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Calculate dynamic steps
      const { calculateApplicationSteps } = require("../utils/stepCalculator");
      const stepData = await calculateApplicationSteps(applicationId);

      // If actor filter provided, compute an actor-scoped view
      if (actor) {
        // Determine predicate
        const predicate = (s) => {
          if (actor === "student") return s.isUserVisible === true || s.actor === "student" || s.actor === "third_party";
          if (actor === "assessor") return s.actor === "assessor";
          if (actor === "admin") return s.actor === "admin";
          if (actor === "third_party") return s.actor === "third_party";
          return true;
        };

        const actorSteps = (stepData.steps || []).filter(predicate);

        // Recalculate current step and progress for this actor
        const actorTotal = actorSteps.length;
        // Completed steps count (do not stop at first incomplete)
        const actorCompleted = actorSteps.filter(s => s.isCompleted).length;
        // Current step is the first incomplete stepNumber, or last stepNumber if all complete
        const firstIncomplete = actorSteps.find(s => !s.isCompleted);
        const actorCurrentStep = firstIncomplete ? firstIncomplete.stepNumber : (actorSteps[actorSteps.length - 1]?.stepNumber || 0);
        const actorProgress = actorTotal > 0 ? Math.round((actorCompleted / actorTotal) * 100) : 0;

        return res.json({
          success: true,
          data: {
            currentStep: actorCurrentStep,
            totalSteps: actorTotal,
            completedSteps: actorCompleted,
            progressPercentage: actorProgress,
            steps: actorSteps,
          },
        });
      }

      res.json({
        success: true,
        data: stepData,
      });
    } catch (error) {
      console.error("Get application steps error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching application steps",
      });
    }
  },

  // Update application step and recalculate progress
  updateApplicationProgress: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user._id;

      // Verify application belongs to user
      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Update application step
      const { updateApplicationStep } = require("../utils/stepCalculator");
      const progressData = await updateApplicationStep(applicationId);

      res.json({
        success: true,
        message: "Application progress updated successfully",
        data: {
          applicationId,
          ...progressData,
        },
      });
    } catch (error) {
      console.error("Update application progress error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating application progress",
      });
    }
  },

  // Update specific step status (for manual updates)
  updateStepStatus: async (req, res) => {
    try {
      const { applicationId, stepType } = req.params;
      const { status, metadata } = req.body;
      const userId = req.user._id;

      // Verify application belongs to user or user is admin/assessor
      const application = await Application.findById(applicationId);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Check permissions
      const isOwner = application.userId.toString() === userId.toString();
      const isAdminOrAssessor = req.user.userType === "admin" || req.user.userType === "assessor" || req.user.userType === "super_admin";
      const isAssignedAssessor = application.assignedAssessor && application.assignedAssessor.toString() === userId.toString();

      if (!isOwner && !isAdminOrAssessor && !isAssignedAssessor) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Update specific step based on type
      let updated = false;
      
      if (stepType === "document_upload") {
        // Update document upload step
        const DocumentUpload = require("../models/documentUpload");
        const docUpload = await DocumentUpload.findOne({ applicationId });
        if (docUpload) {
          docUpload.status = status;
          if (metadata) {
            docUpload.documents = metadata.documents || docUpload.documents;
          }
          await docUpload.save();
          updated = true;
        }
      } else if (stepType === "evidence_upload") {
        // Update evidence upload step
        const DocumentUpload = require("../models/documentUpload");
        const docUpload = await DocumentUpload.findOne({ applicationId });
        if (docUpload) {
          if (metadata) {
            docUpload.images = metadata.images || docUpload.images;
            docUpload.videos = metadata.videos || docUpload.videos;
          }
          await docUpload.save();
          updated = true;
        }
      }

      if (updated) {
        // Recalculate application steps
        const { updateApplicationStep } = require("../utils/stepCalculator");
        const progressData = await updateApplicationStep(applicationId);

        res.json({
          success: true,
          message: "Step status updated successfully",
          data: {
            applicationId,
            stepType,
            status,
            ...progressData,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Invalid step type or step not found",
        });
      }
    } catch (error) {
      console.error("Update step status error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating step status",
      });
    }
  },
};

module.exports = applicationController;
