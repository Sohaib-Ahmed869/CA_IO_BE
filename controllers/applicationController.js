const Application = require("../models/application");
const FormSubmission = require("../models/formSubmission");
const Certification = require("../models/certification");
const InitialScreeningForm = require("../models/initialScreeningForm");

const applicationController = {
  // Get user's applications
  getUserApplications: async (req, res) => {
    try {
      const userId = req.user._id;
      const { rtoFilter } = require("../middleware/tenant");

      const applications = await Application.find({ 
        userId,
        ...rtoFilter(req.rtoId)
      })
        .populate("certificationId", "name description price")
        .populate("initialScreeningFormId")
        .populate({
          path: "paymentId",
          select: "paymentType totalAmount status currency stripePaymentIntentId stripeSubscriptionId paymentPlan metadata createdAt updatedAt"
        })
        .sort({ createdAt: -1 });

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
      console.error("Get user applications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching applications",
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
        console.error("Stripe customer error:", stripeError);
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
        console.error("Stripe customer error:", stripeError);
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
      console.error("Create application with screening error:", error);
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
      console.error("Get application with certificate error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching application",
      });
    }
  },
};

module.exports = applicationController;
