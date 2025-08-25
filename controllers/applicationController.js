const Application = require("../models/application");
const FormSubmission = require("../models/formSubmission");
const Certification = require("../models/certification");
const InitialScreeningForm = require("../models/initialScreeningForm");

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
        status: "submitted",
        submittedAt: new Date(),
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
};

module.exports = applicationController;
