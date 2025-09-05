// controllers/initialScreeningController.js
const InitialScreeningForm = require('../models/initialScreeningForm');
const User = require('../models/user');
const Certification = require('../models/certification');
const Application = require('../models/application');

const initialScreeningController = {
  // Submit initial screening form
  submitInitialScreening: async (req, res) => {
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

      // Check if user already has a screening form for this certification
      const existingScreening = await InitialScreeningForm.findOne({
        userId: userId,
        certificationId: certificationId,
      });

      if (existingScreening) {
        return res.status(400).json({
          success: false,
          message: "Initial screening form already exists for this certification",
        });
      }

      // Create initial screening form
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

      res.status(201).json({
        success: true,
        message: "Initial screening form submitted successfully",
        data: {
          screeningForm: {
            id: initialScreeningForm._id,
            certificationId: initialScreeningForm.certificationId,
            international_student: initialScreeningForm.international_student,
            status: initialScreeningForm.status,
            submittedAt: initialScreeningForm.submittedAt,
          },
          user: {
            international_student: international_student || false,
          }
        },
      });

    } catch (error) {
      console.error('Submit initial screening error:', error);
      res.status(500).json({
        success: false,
        message: "Error submitting initial screening form",
        error: error.message,
      });
    }
  },

  // Update initial screening form
  updateInitialScreening: async (req, res) => {
    try {
      const userId = req.user._id;
      const { screeningFormId } = req.params;
      const {
        workExperienceYears,
        workExperienceLocation,
        currentState,
        hasFormalQualifications,
        formalQualificationsDetails,
        international_student,
      } = req.body;

      // Find the screening form
      const screeningForm = await InitialScreeningForm.findOne({
        _id: screeningFormId,
        userId: userId,
      });

      if (!screeningForm) {
        return res.status(404).json({
          success: false,
          message: "Initial screening form not found",
        });
      }

      // Update the form
      const updatedForm = await InitialScreeningForm.findByIdAndUpdate(
        screeningFormId,
        {
          workExperienceYears,
          workExperienceLocation,
          currentState,
          hasFormalQualifications,
          formalQualificationsDetails: formalQualificationsDetails || "",
          international_student: international_student !== undefined ? international_student : screeningForm.international_student,
          status: "submitted",
          submittedAt: new Date(),
        },
        { new: true }
      );

      // Update user profile with international_student flag
      if (international_student !== undefined) {
        await User.findByIdAndUpdate(userId, {
          international_student: international_student
        });
      }

      res.json({
        success: true,
        message: "Initial screening form updated successfully",
        data: {
          screeningForm: {
            id: updatedForm._id,
            certificationId: updatedForm.certificationId,
            international_student: updatedForm.international_student,
            status: updatedForm.status,
            submittedAt: updatedForm.submittedAt,
          },
        },
      });

    } catch (error) {
      console.error('Update initial screening error:', error);
      res.status(500).json({
        success: false,
        message: "Error updating initial screening form",
        error: error.message,
      });
    }
  },

  // Get user's initial screening forms
  getUserScreeningForms: async (req, res) => {
    try {
      const userId = req.user._id;

      const screeningForms = await InitialScreeningForm.find({ userId })
        .populate('certificationId', 'name price')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: {
          screeningForms: screeningForms.map(form => ({
            id: form._id,
            certification: {
              id: form.certificationId._id,
              name: form.certificationId.name,
              price: form.certificationId.price,
            },
            workExperienceYears: form.workExperienceYears,
            workExperienceLocation: form.workExperienceLocation,
            currentState: form.currentState,
            hasFormalQualifications: form.hasFormalQualifications,
            formalQualificationsDetails: form.formalQualificationsDetails,
            international_student: form.international_student,
            status: form.status,
            submittedAt: form.submittedAt,
            createdAt: form.createdAt,
          })),
        },
      });

    } catch (error) {
      console.error('Get user screening forms error:', error);
      res.status(500).json({
        success: false,
        message: "Error fetching initial screening forms",
        error: error.message,
      });
    }
  },

  // Get specific initial screening form
  getScreeningForm: async (req, res) => {
    try {
      const userId = req.user._id;
      const { screeningFormId } = req.params;

      const screeningForm = await InitialScreeningForm.findOne({
        _id: screeningFormId,
        userId: userId,
      }).populate('certificationId', 'name price');

      if (!screeningForm) {
        return res.status(404).json({
          success: false,
          message: "Initial screening form not found",
        });
      }

      res.json({
        success: true,
        data: {
          screeningForm: {
            id: screeningForm._id,
            certification: {
              id: screeningForm.certificationId._id,
              name: screeningForm.certificationId.name,
              price: screeningForm.certificationId.price,
            },
            workExperienceYears: screeningForm.workExperienceYears,
            workExperienceLocation: screeningForm.workExperienceLocation,
            currentState: screeningForm.currentState,
            hasFormalQualifications: screeningForm.hasFormalQualifications,
            formalQualificationsDetails: screeningForm.formalQualificationsDetails,
            international_student: screeningForm.international_student,
            status: screeningForm.status,
            submittedAt: screeningForm.submittedAt,
            createdAt: screeningForm.createdAt,
          },
        },
      });

    } catch (error) {
      console.error('Get screening form error:', error);
      res.status(500).json({
        success: false,
        message: "Error fetching initial screening form",
        error: error.message,
      });
    }
  },
};

module.exports = initialScreeningController;
