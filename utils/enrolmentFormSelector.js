// utils/enrolmentFormSelector.js
const Certification = require('../models/certification');
const FormTemplate = require('../models/formTemplate');

class EnrolmentFormSelector {
  // Form IDs for CPP20218 - Certificate II in Security Operations
  static FORM_IDS = {
    INTERNATIONAL: '68b7e1dc3a96b33ba5448baa', // International student form
    LOCAL: '68baf3445d43ebde364e8893' // Local student form
  };

  // Certification ID for CPP20218
  static CERTIFICATION_ID = '68b80373c716839c3e29e117';

  /**
   * Get the correct enrolment form ID based on student type
   * @param {boolean} isInternational - Whether the student is international
   * @returns {string} Form template ID
   */
  static getEnrolmentFormId(isInternational) {
    return isInternational ? this.FORM_IDS.INTERNATIONAL : this.FORM_IDS.LOCAL;
  }

  /**
   * Get enrolment form details for a specific certification
   * @param {string} certificationId - Certification ID
   * @param {boolean} isInternational - Whether the student is international
   * @returns {Object} Form details
   */
  static async getEnrolmentFormDetails(certificationId, isInternational) {
    try {
      // Check if this is the CPP20218 certification
      if (certificationId.toString() === this.CERTIFICATION_ID) {
        const formId = this.getEnrolmentFormId(isInternational);
        const formTemplate = await FormTemplate.findById(formId);
        
        if (!formTemplate) {
          throw new Error(`Form template not found: ${formId}`);
        }

        return {
          formId,
          formName: formTemplate.name,
          isInternational,
          studentType: isInternational ? 'International' : 'Local'
        };
      }

      // For other certifications, return the first enrolment form
      const certification = await Certification.findById(certificationId)
        .populate('formTemplateIds.formTemplateId');
      
      if (!certification) {
        throw new Error('Certification not found');
      }

      // Try to find enrolment form by name or title
      let enrolmentForm = certification.formTemplateIds.find(
        ft => (ft.title && ft.title.toLowerCase().includes('enrolment')) ||
              (ft.formTemplateId && ft.formTemplateId.name && ft.formTemplateId.name.toLowerCase().includes('enrolment'))
      );

      // If no enrolment form found by name, just return the first form
      if (!enrolmentForm) {
        enrolmentForm = certification.formTemplateIds[0];
      }

      if (!enrolmentForm) {
        throw new Error('No forms found for this certification');
      }

      return {
        formId: enrolmentForm.formTemplateId._id,
        formName: enrolmentForm.formTemplateId.name,
        isInternational: false, // Default for other certifications
        studentType: 'Default'
      };
    } catch (error) {
      console.error('Error getting enrolment form details:', error);
      throw error;
    }
  }

  /**
   * Update certification form templates based on student type
   * @param {string} certificationId - Certification ID
   * @param {boolean} isInternational - Whether the student is international
   * @returns {Object} Updated certification
   */
  static async updateCertificationForms(certificationId, isInternational) {
    try {
      if (certificationId !== this.CERTIFICATION_ID) {
        // For other certifications, no changes needed
        return await Certification.findById(certificationId);
      }

      const formId = this.getEnrolmentFormId(isInternational);
      
      // Update the certification to use the correct form
      const certification = await Certification.findByIdAndUpdate(
        certificationId,
        {
          $set: {
            'formTemplateIds.0.formTemplateId': formId,
            'formTemplateIds.0.title': isInternational ? 'International Enrolment Form' : 'Local Enrolment Form'
          }
        },
        { new: true }
      ).populate('formTemplateIds.formTemplateId');

      return certification;
    } catch (error) {
      console.error('Error updating certification forms:', error);
      throw error;
    }
  }
}

module.exports = EnrolmentFormSelector;
