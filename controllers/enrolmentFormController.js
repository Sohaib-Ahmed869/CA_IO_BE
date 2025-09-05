// controllers/enrolmentFormController.js
const EnrolmentFormSelector = require('../utils/enrolmentFormSelector');
const User = require('../models/user');
const Application = require('../models/application');
const Certification = require('../models/certification');

const enrolmentFormController = {
  // Get the correct enrolment form for a user's application
  getEnrolmentForm: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;

      // Verify application belongs to user
      const application = await Application.findOne({
        _id: applicationId,
        userId: userId
      }).populate('certificationId');

      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Application not found or access denied'
        });
      }

      // Get user's international student status
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get the correct enrolment form
      const formDetails = await EnrolmentFormSelector.getEnrolmentFormDetails(
        application.certificationId._id,
        user.international_student
      );

      res.json({
        success: true,
        data: {
          applicationId: application._id,
          certificationName: application.certificationId.name,
          formDetails: formDetails,
          user: {
            name: `${user.firstName} ${user.lastName}`,
            international_student: user.international_student
          }
        }
      });

    } catch (error) {
      console.error('Get enrolment form error:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting enrolment form',
        error: error.message
      });
    }
  },

  // Update user's international student status
  updateInternationalStatus: async (req, res) => {
    try {
      const { international_student } = req.body;
      const userId = req.user.id;

      // Update user profile
      const user = await User.findByIdAndUpdate(
        userId,
        { international_student: international_student },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: 'International student status updated',
        data: {
          international_student: user.international_student
        }
      });

    } catch (error) {
      console.error('Update international status error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating international student status',
        error: error.message
      });
    }
  },

  // Get all forms for an application with correct enrolment form
  getApplicationForms: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;

      // Verify application belongs to user
      const application = await Application.findOne({
        _id: applicationId,
        userId: userId
      }).populate({
        path: 'certificationId',
        populate: {
          path: 'formTemplateIds.formTemplateId'
        }
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Application not found or access denied'
        });
      }

      // Get user's international student status
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if this is CPP20218 certification
      const isCPP20218 = application.certificationId._id.toString() === '68b80373c716839c3e29e117';
      
      let forms;
      
      if (isCPP20218) {
        // Special logic for CPP20218 - show correct enrolment form based on student type
        const enrolmentFormDetails = await EnrolmentFormSelector.getEnrolmentFormDetails(
          application.certificationId._id,
          user.international_student
        );

        // Filter out existing enrolment forms and add the correct one
        const filteredFormTemplates = application.certificationId.formTemplateIds.filter(
          formTemplate => !formTemplate.formTemplateId.name.toLowerCase().includes('enrolment')
        );

        // Get the correct enrolment form template
        const FormTemplate = require('../models/formTemplate');
        const correctEnrolmentFormTemplate = await FormTemplate.findById(enrolmentFormDetails.formId);

        // Add the correct enrolment form at the beginning (step 1)
        const correctEnrolmentForm = {
          stepNumber: 1,
          formTemplateId: {
            _id: enrolmentFormDetails.formId,
            name: correctEnrolmentFormTemplate.name
          },
          filledBy: "user",
          title: `${enrolmentFormDetails.studentType} Enrolment Form`,
          _id: `enrolment_${enrolmentFormDetails.studentType.toLowerCase()}`
        };

        // Combine the correct enrolment form with other forms
        const allFormTemplates = [correctEnrolmentForm, ...filteredFormTemplates];

        // Format the forms for response
        forms = allFormTemplates.map((formTemplate, index) => ({
          stepNumber: formTemplate.stepNumber || (index + 1),
          formId: formTemplate.formTemplateId._id,
          formName: formTemplate.formTemplateId.name,
          title: formTemplate.title,
          filledBy: formTemplate.filledBy,
          isEnrolmentForm: formTemplate.title?.toLowerCase().includes('enrolment') || false,
          studentType: formTemplate.title?.includes('International') ? 'International' : 
                      formTemplate.title?.includes('Local') ? 'Local' : 'Default'
        }));
      } else {
        // For other certifications, use default forms without modification
        forms = application.certificationId.formTemplateIds.map((formTemplate, index) => ({
          stepNumber: formTemplate.stepNumber || (index + 1),
          formId: formTemplate.formTemplateId._id,
          formName: formTemplate.formTemplateId.name,
          title: formTemplate.title,
          filledBy: formTemplate.filledBy,
          isEnrolmentForm: formTemplate.formTemplateId.name.toLowerCase().includes('enrolment'),
          studentType: 'Default'
        }));
      }

      res.json({
        success: true,
        data: {
          applicationId: application._id,
          certificationName: application.certificationId.name,
          forms: forms,
          user: {
            name: `${user.firstName} ${user.lastName}`,
            international_student: user.international_student
          },
          enrolmentFormDetails: enrolmentFormDetails
        }
      });

    } catch (error) {
      console.error('Get application forms error:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting application forms',
        error: error.message
      });
    }
  }
};

module.exports = enrolmentFormController;
