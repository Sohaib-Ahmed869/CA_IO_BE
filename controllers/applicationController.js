const Application = require("../models/application");
const logme = require("../utils/logger");
const FormSubmission = require("../models/formSubmission");
const Certification = require("../models/certification");
const InitialScreeningForm = require("../models/initialScreeningForm");

const applicationController = {
  // Get user's applications
  getUserApplications: async (req, res) => {
    try {
      const userId = req.user._id;
      const { rtoFilter, rtoFilterWithLegacy } = require("../middleware/tenant");

      logme.info("Get user applications called", {
        userId: userId,
        rtoId: req.rtoId,
        userType: req.user.userType
      });

      // Build query - show applications for current RTO context
      let query = { userId };
      
      // Get RTO ID from subdomain and filter applications by it
      if (req.rtoId) {
        query = {
          userId,
          rtoId: req.rtoId
        };
        logme.info("Filtering applications by RTO", { 
          userId: userId,
          rtoId: req.rtoId
        });
      } else {
        logme.info("No RTO context available", { userId: userId });
      }

      // First check if applications exist without RTO filtering
      const allUserApplications = await Application.find({ userId });
      logme.info("All user applications without RTO filter", { 
        count: allUserApplications.length,
        applications: allUserApplications.map(app => ({ 
          id: app._id, 
          certificationId: app.certificationId,
          rtoId: app.rtoId,
          overallStatus: app.overallStatus
        }))
      });

      // Check what RTOs the user's applications belong to
      const rtoIds = [...new Set(allUserApplications.map(app => app.rtoId?.toString()))];
      logme.info("RTOs found in user applications", { 
        rtoIds: rtoIds,
        currentRtoId: req.rtoId
      });

      const applications = await Application.find(query)
        .populate("certificationId", "name description price")
        .populate("initialScreeningFormId")
        .populate({
          path: "paymentId",
          select: "paymentType totalAmount status currency stripePaymentIntentId stripeSubscriptionId paymentPlan metadata createdAt updatedAt"
        })
        .sort({ createdAt: -1 });

      logme.info("User applications found with filter", { 
        count: applications.length,
        query: query,
        applications: applications.map(app => ({ 
          id: app._id, 
          name: app.certificationId?.name,
          rtoId: app.rtoId,
          overallStatus: app.overallStatus
        }))
      });

      // Also check if the specific application exists with the current RTO
      if (req.rtoId) {
        const specificRtoApps = await Application.find({ 
          userId, 
          rtoId: req.rtoId 
        });
        logme.info("Applications with specific RTO", { 
          rtoId: req.rtoId,
          count: specificRtoApps.length,
          apps: specificRtoApps.map(app => ({ 
            id: app._id, 
            rtoId: app.rtoId,
            overallStatus: app.overallStatus
          }))
        });
      }

      // Process applications to ensure payment data is properly included
      const processedApplications = applications.map(app => {
        const appObj = app.toObject();
        
        // If no payment exists, create a default payment structure
        if (!appObj.paymentId) {
          appObj.paymentId = {
            paymentType: "one_time",
            totalAmount: appObj.certificationId?.price || 0,
            status: "pending",
            currency: "AUD",
            metadata: {
              autoCreated: false,
              missingPayment: true
            }
          };
        }
        
        return appObj;
      });

      res.json({
        success: true,
        data: processedApplications,
      });
    } catch (error) {
      logme.error("Get user applications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching applications",
      });
    }
  },

  // Debug endpoint to check user applications
  debugUserApplications: async (req, res) => {
    try {
      const userId = req.user._id;
      const { rtoFilter, rtoFilterWithLegacy } = require("../middleware/tenant");

      logme.info("Debug user applications", {
        userId: userId,
        userEmail: req.user.email,
        rtoId: req.rtoId,
        userType: req.user.userType
      });

      // Check all applications for this user (no RTO filter)
      const allApplications = await Application.find({ userId });
      
      // Check applications with different RTO filters (for debugging only)
      const rtoFilteredApps = req.rtoId ? await Application.find({ 
        userId, 
        ...rtoFilter(req.rtoId) 
      }) : [];
      
      const legacyFilteredApps = req.rtoId ? await Application.find({ 
        userId, 
        ...rtoFilterWithLegacy(req.rtoId) 
      }) : [];

      // Check if user has any applications at all
      const userHasApplications = allApplications.length > 0;

      res.json({
        success: true,
        data: {
          userId: userId,
          userEmail: req.user.email,
          rtoId: req.rtoId,
          userType: req.user.userType,
          userHasApplications,
          applicationCounts: {
            total: allApplications.length,
            rtoFiltered: rtoFilteredApps.length,
            legacyFiltered: legacyFilteredApps.length
          },
          applications: {
            all: allApplications.map(app => ({
              id: app._id,
              certificationId: app.certificationId,
              rtoId: app.rtoId,
              overallStatus: app.overallStatus,
              createdAt: app.createdAt
            })),
            rtoFiltered: rtoFilteredApps.map(app => ({
              id: app._id,
              certificationId: app.certificationId,
              rtoId: app.rtoId,
              overallStatus: app.overallStatus
            })),
            legacyFiltered: legacyFilteredApps.map(app => ({
              id: app._id,
              certificationId: app.certificationId,
              rtoId: app.rtoId,
              overallStatus: app.overallStatus
            }))
          }
        }
      });
    } catch (error) {
      logme.error("Debug user applications error:", error);
      res.status(500).json({
        success: false,
        message: "Error debugging user applications",
        error: error.message
      });
    }
  },

  // Get application tracking information
  getApplicationTracking: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user._id;

      // Get application with all tracking data
      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
        ...(req.rtoId && { rtoId: req.rtoId })
      })
        .populate("certificationId", "name description")
        .populate("assignedAssessor", "firstName lastName email")
        .populate("assignedAgent", "firstName lastName email")
        .populate("paymentId", "status totalAmount currency")
        .populate("documentUploadId", "status documents")
        .populate("initialScreeningFormId");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Get form submissions for this application
      const formSubmissions = await FormSubmission.find({
        applicationId: applicationId
      })
        .populate("formTemplateId", "name stepNumber filledBy")
        .sort({ stepNumber: 1 });

      // Calculate progress
      const totalSteps = formSubmissions.length;
      const completedSteps = formSubmissions.filter(sub => sub.status === "submitted").length;
      const progressPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

      // Get tracking timeline
      const timeline = [];
      
      // Application creation
      timeline.push({
        date: application.createdAt,
        event: "Application Created",
        description: "Application submitted successfully",
        status: "completed"
      });

      // Initial screening
      if (application.initialScreeningFormId) {
        timeline.push({
          date: application.initialScreeningFormId.createdAt,
          event: "Initial Screening",
          description: "Initial screening form completed",
          status: "completed"
        });
      }

      // Payment
      if (application.paymentId) {
        timeline.push({
          date: application.paymentId.createdAt,
          event: "Payment",
          description: `Payment ${application.paymentId.status}`,
          status: application.paymentId.status === "succeeded" ? "completed" : "pending"
        });
      }

      // Form submissions
      formSubmissions.forEach(submission => {
        timeline.push({
          date: submission.submittedAt,
          event: `Form: ${submission.formTemplateId?.name || 'Unknown Form'}`,
          description: `Step ${submission.stepNumber} - ${submission.status}`,
          status: submission.status === "submitted" ? "completed" : "pending"
        });
      });

      // Assessment
      if (application.overallStatus === "assessment_pending" || application.overallStatus === "assessment_completed") {
        timeline.push({
          date: application.updatedAt,
          event: "Assessment",
          description: `Assessment ${application.overallStatus === "assessment_completed" ? "completed" : "pending"}`,
          status: application.overallStatus === "assessment_completed" ? "completed" : "pending"
        });
      }

      // Certificate
      if (application.finalCertificate && application.finalCertificate.s3Key) {
        timeline.push({
          date: application.finalCertificate.uploadedAt,
          event: "Certificate Issued",
          description: "Final certificate uploaded",
          status: "completed"
        });
      }

      // Sort timeline by date
      timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Build tracking response
      const trackingInfo = {
        applicationId: application._id,
        studentName: `${application.userId?.firstName || ''} ${application.userId?.lastName || ''}`.trim(),
        certificationName: application.certificationId?.name || "Unknown Certification",
        overallStatus: application.overallStatus,
        currentStep: application.currentStep || 1,
        progress: {
          percentage: progressPercentage,
          completedSteps: completedSteps,
          totalSteps: totalSteps
        },
        timeline: timeline,
        formSubmissions: formSubmissions.map(sub => ({
          stepNumber: sub.stepNumber,
          formName: sub.formTemplateId?.name || "Unknown Form",
          status: sub.status,
          submittedAt: sub.submittedAt,
          filledBy: sub.formTemplateId?.filledBy || "user"
        })),
        tracking: {
          callAttempts: application.callAttempts || 0,
          contactStatus: application.contactStatus,
          leadStatus: application.leadStatus,
          internalNotes: application.internalNotes,
          assignedAssessor: application.assignedAssessor ? {
            name: `${application.assignedAssessor.firstName} ${application.assignedAssessor.lastName}`,
            email: application.assignedAssessor.email
          } : null,
          assignedAgent: application.assignedAgent ? {
            name: `${application.assignedAgent.firstName} ${application.assignedAgent.lastName}`,
            email: application.assignedAgent.email
          } : null
        },
        documents: application.documentUploadId ? {
          status: application.documentUploadId.status,
          count: application.documentUploadId.documents?.length || 0
        } : null,
        payment: application.paymentId ? {
          status: application.paymentId.status,
          amount: application.paymentId.totalAmount,
          currency: application.paymentId.currency
        } : null,
        certificate: application.finalCertificate ? {
          certificateNumber: application.finalCertificate.certificateNumber,
          uploadedAt: application.finalCertificate.uploadedAt,
          expiryDate: application.finalCertificate.expiryDate,
          grade: application.finalCertificate.grade
        } : null,
        dates: {
          createdAt: application.createdAt,
          updatedAt: application.updatedAt,
          completedAt: application.completedAt,
          archivedAt: application.archivedAt
        }
      };

      res.json({
        success: true,
        data: trackingInfo,
      });
    } catch (error) {
      logme.error("Get application tracking error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching application tracking",
        error: error.message,
      });
    }
  },

  // Get specific application
  getApplicationById: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user._id;
      const { rtoFilter } = require("../middleware/tenant");

      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
        ...rtoFilter(req.rtoId)
      })
        .populate("certificationId")
        .populate("initialScreeningFormId")
        .populate({
          path: "paymentId",
          select: "paymentType totalAmount status currency stripePaymentIntentId stripeSubscriptionId paymentPlan metadata createdAt updatedAt"
        });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Process application to ensure payment data is properly included
      const appObj = application.toObject();
      
      // If no payment exists, create a default payment structure
      if (!appObj.paymentId) {
        appObj.paymentId = {
          paymentType: "one_time",
          totalAmount: appObj.certificationId?.price || 0,
          status: "pending",
          currency: "AUD",
          metadata: {
            autoCreated: false,
            missingPayment: true
          }
        };
      }

      res.json({
        success: true,
        data: appObj,
      });
    } catch (error) {
      logme.error("Get application error:", error);
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
      const { rtoId } = req.query; // Get rtoId from query params
      const { rtoFilter } = require("../middleware/tenant");

      // Verify certification exists (RTO-specific)
      const certification = await Certification.findOne({
        _id: certificationId,
        ...rtoFilter(rtoId || req.rtoId)
      });
      if (!certification) {
        return res.status(404).json({
          success: false,
          message: "Certification not found",
        });
      }

      // Create new application with RTO context
      const application = await Application.create({
        userId: userId,
        certificationId: certificationId,
        rtoId: rtoId || req.rtoId, // Use provided rtoId or fallback to req.rtoId
        overallStatus: "payment_pending",
        currentStep: 1,
      });

      // AUTO CREATE ONE-TIME PAYMENT - ADD THIS SECTION
      const Payment = require("../models/payment");
      const User = require("../models/user");
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
        logme.error("Stripe customer error:", stripeError);
        // Continue without Stripe customer - can be created later
      }

      // Create default one-time payment with RTO context
      const payment = await Payment.create({
        userId: userId,
        applicationId: application._id,
        certificationId: certificationId,
        rtoId: rtoId || req.rtoId, // Use provided rtoId or fallback to req.rtoId
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
        .populate("userId", "firstName lastName email")
        .populate("paymentId");

      res.status(201).json({
        success: true,
        message: "New application created successfully",
        data: {
          application: populatedApplication,
          payment: payment, // Include payment in response
        },
      });

      // Send welcome email with RTO branding
      EmailHelpers.handleApplicationCreated(user, application, certification, rtoId || req.rtoId).catch(
        console.error
      );
    } catch (error) {
      logme.error("Create new application error:", error);
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
      const { rtoFilter } = require("../middleware/tenant");

      // Get all active certifications (RTO-specific)
      const allCertifications = await Certification.find({
        isActive: true,
        ...rtoFilter(req.rtoId)
      }).select("name description price");

      // Get user's active applications (RTO-specific)
      const userActiveApplications = await Application.find({
        userId: userId,
        overallStatus: {
          $nin: ["completed", "rejected", "certificate_issued"],
        },
        ...rtoFilter(req.rtoId)
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
      logme.error("Get available certifications error:", error);
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
      } = req.body;
      const { rtoId } = req.query; // Get rtoId from query params
      const { rtoFilter } = require("../middleware/tenant");

      // Verify certification exists (RTO-specific)
      const certification = await Certification.findOne({
        _id: certificationId,
        ...rtoFilter(rtoId || req.rtoId)
      });
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
        status: "submitted",
        submittedAt: new Date(),
      });

      // Create application with RTO context
      const application = await Application.create({
        userId: userId,
        certificationId: certificationId,
        rtoId: rtoId || req.rtoId, // Use provided rtoId or fallback to req.rtoId
        initialScreeningFormId: initialScreeningForm._id,
        overallStatus: "payment_pending",
        currentStep: 1,
      });

      // AUTO CREATE ONE-TIME PAYMENT - ADD THIS SECTION
      const Payment = require("../models/payment");
      const User = require("../models/user");
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
        logme.error("Stripe customer error:", stripeError);
        // Continue without Stripe customer - can be created later
      }

      // Create default one-time payment with RTO context
      const payment = await Payment.create({
        userId: userId,
        applicationId: application._id,
        certificationId: certificationId,
        rtoId: rtoId || req.rtoId, // Use provided rtoId or fallback to req.rtoId
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
        .populate({
          path: "paymentId",
          select: "paymentType totalAmount status currency stripePaymentIntentId stripeSubscriptionId paymentPlan metadata createdAt updatedAt"
        });

      res.status(201).json({
        success: true,
        message: "Application with initial screening created successfully",
        data: {
          application: populatedApplication,
          initialScreeningForm: initialScreeningForm,
          payment: payment, // Include payment in response
        },
      });

      // Send welcome email with RTO branding
      EmailHelpers.handleApplicationCreated(user, application, certification, rtoId || req.rtoId).catch(
        console.error
      );
    } catch (error) {
      logme.error("Create application with screening error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating application with screening",
      });
    }
  },

  getApplicationWithCertificate: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user._id;
      const { rtoFilter } = require("../middleware/tenant");

      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
        ...rtoFilter(req.rtoId)
      })
        .populate("certificationId")
        .populate("initialScreeningFormId")
        .populate({
          path: "paymentId",
          select: "paymentType totalAmount status currency stripePaymentIntentId stripeSubscriptionId paymentPlan metadata createdAt updatedAt"
        });

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
      logme.error("Get application with certificate error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching application",
      });
    }
  },
};

module.exports = applicationController;
