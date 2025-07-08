const Application = require("../models/application");
const FormSubmission = require("../models/formSubmission");
const Certification = require("../models/certification");
const InitialScreeningForm = require("../models/initialScreeningForm");

const applicationController = {
  // Get user's applications
  getUserApplications: async (req, res) => {
    try {
      const userId = req.user.id;

      const applications = await Application.find({ userId })
        .populate("certificationId", "name description price")
        .populate("initialScreeningFormId")
        .populate("paymentId")
        .sort({ createdAt: -1 });

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
      const userId = req.user.id;

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
      const userId = req.user.id;
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
      const userId = req.user.id;

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

      // Get certification IDs that user already has active applications for
      const activeCertificationIds = userActiveApplications.map((app) =>
        app.certificationId.toString()
      );

      // Filter out certifications with active applications
      const availableCertifications = allCertifications.filter(
        (cert) => !activeCertificationIds.includes(cert._id.toString())
      );

      res.json({
        success: true,
        data: {
          available: availableCertifications,
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
  // Create application with initial screening
  createApplicationWithScreening: async (req, res) => {
    try {
      const userId = req.user.id;
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

      // Populate the response
      const populatedApplication = await Application.findById(application._id)
        .populate("certificationId", "name description price")
        .populate("initialScreeningFormId");

      res.status(201).json({
        success: true,
        message: "Application with initial screening created successfully",
        data: {
          application: populatedApplication,
          initialScreeningForm: initialScreeningForm,
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

  
};

module.exports = applicationController;
