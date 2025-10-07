// utils/rtoEmailUtils.js
const RTOEmailService = require("../services/rtoEmailService");
const { logMe } = require("./logger");

/**
 * Get RTO-specific email service instance
 * @param {Object} rtoConfig - RTO configuration object
 * @returns {RTOEmailService} Email service instance
 */
const getRTOEmailService = (rtoConfig) => {
  try {
    if (!rtoConfig) {
      logMe("rto.email.no_config", { message: "No RTO config provided, using default email service" }, "warn");
      return null;
    }

    const emailService = new RTOEmailService(rtoConfig);
    
    logMe("rto.email.service_created", {
      rtoCode: rtoConfig.rtoCode,
      rtoName: rtoConfig.name,
      hasEmailConfig: !!rtoConfig.emailConfig
    });

    return emailService;
  } catch (error) {
    logMe("rto.email.service_error", {
      rtoCode: rtoConfig?.rtoCode,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send email using RTO-specific configuration
 * @param {Object} rtoConfig - RTO configuration object
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} htmlContent - Email HTML content
 * @param {Array} attachments - Email attachments
 * @returns {Promise<Object>} Send result
 */
const sendRTOEmail = async (rtoConfig, to, subject, htmlContent, attachments = []) => {
  try {
    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      // Fallback to default email service if RTO config not available
      const { defaultEmailService } = require("../services/emailService");
      return await defaultEmailService.sendEmail(to, subject, htmlContent, attachments);
    }

    return await emailService.sendEmail(to, subject, htmlContent, attachments);
  } catch (error) {
    logMe("rto.email.send_error", {
      rtoCode: rtoConfig?.rtoCode,
      to,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send welcome email using RTO-specific configuration
 * @param {Object} rtoConfig - RTO configuration object
 * @param {Object} user - User object
 * @param {Object} certification - Certification object
 * @returns {Promise<Object>} Send result
 */
const sendRTOWelcomeEmail = async (rtoConfig, user, certification) => {
  try {
    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      logMe("rto.email.no_service", { message: "No email service available for welcome email" }, "warn");
      return { success: false, error: "No email service available" };
    }

    return await emailService.sendWelcomeEmail(user, certification);
  } catch (error) {
    logMe("rto.email.welcome_error", {
      rtoCode: rtoConfig?.rtoCode,
      userEmail: user?.email,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send payment confirmation email using RTO-specific configuration
 * @param {Object} rtoConfig - RTO configuration object
 * @param {Object} user - User object
 * @param {Object} payment - Payment object
 * @param {Object} application - Application object
 * @returns {Promise<Object>} Send result
 */
const sendRTOPaymentConfirmationEmail = async (rtoConfig, user, payment, application) => {
  try {
    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      logMe("rto.email.no_service", { message: "No email service available for payment confirmation email" }, "warn");
      return { success: false, error: "No email service available" };
    }

    return await emailService.sendPaymentConfirmationEmail(user, payment, application);
  } catch (error) {
    logMe("rto.email.payment_error", {
      rtoCode: rtoConfig?.rtoCode,
      userEmail: user?.email,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send COE email using RTO-specific configuration
 * @param {Object} rtoConfig - RTO configuration object
 * @param {Object} user - User object
 * @param {Object} application - Application object
 * @param {Buffer} coePdfBuffer - COE PDF buffer
 * @returns {Promise<Object>} Send result
 */
const sendRTOCoeEmail = async (rtoConfig, user, application, coePdfBuffer) => {
  try {
    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      logMe("rto.email.no_service", { message: "No email service available for COE email" }, "warn");
      return { success: false, error: "No email service available" };
    }

    return await emailService.sendCOEEmail(user, application, coePdfBuffer);
  } catch (error) {
    logMe("rto.email.coe_error", {
      rtoCode: rtoConfig?.rtoCode,
      userEmail: user?.email,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send assessor notification email using RTO-specific configuration
 * @param {Object} rtoConfig - RTO configuration object
 * @param {Object} assessor - Assessor object
 * @param {Object} student - Student object
 * @param {Object} application - Application object
 * @param {string} formName - Form name
 * @returns {Promise<Object>} Send result
 */
const sendRTOAssessorNotificationEmail = async (rtoConfig, assessor, student, application, formName) => {
  try {
    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      logMe("rto.email.no_service", { message: "No email service available for assessor notification email" }, "warn");
      return { success: false, error: "No email service available" };
    }

    return await emailService.sendAssessorNotificationEmail(assessor, student, application, formName);
  } catch (error) {
    logMe("rto.email.assessor_error", {
      rtoCode: rtoConfig?.rtoCode,
      assessorEmail: assessor?.email,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send form submission email using RTO-specific configuration
 */
const sendRTOFormSubmissionEmail = async (rtoConfig, user, application, formName) => {
  try {
    logMe("rto.email.form_submission_start", {
      rtoCode: rtoConfig?.rtoCode,
      rtoName: rtoConfig?.name,
      userEmail: user?.email,
      applicationCode: application?.appCode,
      formName: formName
    }, 'debug');

    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      logMe("rto.email.no_service", { message: "No email service available for form submission email" }, "warn");
      return { success: false, error: "No email service available" };
    }

    logMe("rto.email.form_submission_calling_service", {
      rtoCode: rtoConfig?.rtoCode,
      serviceExists: !!emailService
    }, 'debug');

    return await emailService.sendFormSubmissionEmail(user, application, formName);
  } catch (error) {
    logMe("rto.email.form_submission_error", {
      rtoCode: rtoConfig?.rtoCode,
      userEmail: user?.email,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send assessment completion email using RTO-specific configuration
 */
const sendRTOAssessmentCompletionEmail = async (rtoConfig, user, application, assessor) => {
  try {
    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      logMe("rto.email.no_service", { message: "No email service available for assessment completion email" }, "warn");
      return { success: false, error: "No email service available" };
    }

    return await emailService.sendAssessmentCompletionEmail(user, application, assessor);
  } catch (error) {
    logMe("rto.email.assessment_completion_error", {
      rtoCode: rtoConfig?.rtoCode,
      userEmail: user?.email,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send certificate ready email using RTO-specific configuration
 */
const sendRTOCertificateReadyEmail = async (rtoConfig, user, application, certificateUrl) => {
  try {
    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      logMe("rto.email.no_service", { message: "No email service available for certificate ready email" }, "warn");
      return { success: false, error: "No email service available" };
    }

    return await emailService.sendCertificateReadyEmail(user, application, certificateUrl);
  } catch (error) {
    logMe("rto.email.certificate_ready_error", {
      rtoCode: rtoConfig?.rtoCode,
      userEmail: user?.email,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send document submission email using RTO-specific configuration
 */
const sendRTODocumentSubmissionEmail = async (rtoConfig, user, application, documentType) => {
  try {
    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      logMe("rto.email.no_service", { message: "No email service available for document submission email" }, "warn");
      return { success: false, error: "No email service available" };
    }

    return await emailService.sendDocumentSubmissionEmail(user, application, documentType);
  } catch (error) {
    logMe("rto.email.document_submission_error", {
      rtoCode: rtoConfig?.rtoCode,
      userEmail: user?.email,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send document verification email using RTO-specific configuration
 */
const sendRTODocumentVerificationEmail = async (rtoConfig, user, application, assessor, status, rejectionReason = null) => {
  try {
    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      logMe("rto.email.no_service", { message: "No email service available for document verification email" }, "warn");
      return { success: false, error: "No email service available" };
    }

    return await emailService.sendDocumentVerificationEmail(user, application, assessor, status, rejectionReason);
  } catch (error) {
    logMe("rto.email.document_verification_error", {
      rtoCode: rtoConfig?.rtoCode,
      userEmail: user?.email,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send form resubmission required email using RTO-specific configuration
 */
const sendRTOFormResubmissionRequiredEmail = async (rtoConfig, user, application, formName, feedback) => {
  try {
    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      logMe("rto.email.no_service", { message: "No email service available for form resubmission email" }, "warn");
      return { success: false, error: "No email service available" };
    }

    return await emailService.sendFormResubmissionRequiredEmail(user, application, formName, feedback);
  } catch (error) {
    logMe("rto.email.form_resubmission_error", {
      rtoCode: rtoConfig?.rtoCode,
      userEmail: user?.email,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send form approval email using RTO-specific configuration
 */
const sendRTOFormApprovalEmail = async (rtoConfig, user, application, formName, assessor) => {
  try {
    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      logMe("rto.email.no_service", { message: "No email service available for form approval email" }, "warn");
      return { success: false, error: "No email service available" };
    }

    return await emailService.sendFormApprovalEmail(user, application, formName, assessor);
  } catch (error) {
    logMe("rto.email.form_approval_error", {
      rtoCode: rtoConfig?.rtoCode,
      userEmail: user?.email,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send admin account creation email using RTO-specific configuration
 */
const sendRTOAdminCreatedAccountEmail = async (rtoConfig, user, plainPassword) => {
  try {
    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      logMe("rto.email.no_service", { message: "No email service available for admin account creation email" }, "warn");
      return { success: false, error: "No email service available" };
    }

    return await emailService.sendAdminCreatedAccountEmail(user, plainPassword);
  } catch (error) {
    logMe("rto.email.admin_account_error", {
      rtoCode: rtoConfig?.rtoCode,
      userEmail: user?.email,
      error: error.message
    }, "error");
    throw error;
  }
};

/**
 * Send certificate download email using RTO-specific configuration
 */
const sendRTOCertificateDownloadEmail = async (rtoConfig, user, application, certificateDetails) => {
  try {
    const emailService = getRTOEmailService(rtoConfig);
    
    if (!emailService) {
      logMe("rto.email.no_service", { message: "No email service available for certificate download email" }, "warn");
      return { success: false, error: "No email service available" };
    }

    return await emailService.sendCertificateDownloadEmail(user, application, certificateDetails);
  } catch (error) {
    logMe("rto.email.certificate_download_error", {
      rtoCode: rtoConfig?.rtoCode,
      userEmail: user?.email,
      error: error.message
    }, "error");
    throw error;
  }
};

module.exports = {
  getRTOEmailService,
  sendRTOEmail,
  sendRTOWelcomeEmail,
  sendRTOPaymentConfirmationEmail,
  sendRTOCoeEmail,
  sendRTOAssessorNotificationEmail,
  sendRTOFormSubmissionEmail,
  sendRTOAssessmentCompletionEmail,
  sendRTOCertificateReadyEmail,
  sendRTODocumentSubmissionEmail,
  sendRTODocumentVerificationEmail,
  sendRTOFormResubmissionRequiredEmail,
  sendRTOFormApprovalEmail,
  sendRTOAdminCreatedAccountEmail,
  sendRTOCertificateDownloadEmail
};
