// utils/emailHelpers.js
const UnifiedEmailService = require("../services/unifiedEmailService");
const { sendRTOWelcomeEmail, sendRTOEmail } = require("./rtoEmailUtils");
const User = require("../models/user");
const { logMe } = require('../utils/logger');

class EmailHelpers {
  // Get admin emails for notifications
  static async getAdminEmails() {
    try {
      const admins = await User.find({
        userType: "admin",
        isActive: true,
      }).select("email");

      return admins.map((admin) => admin.email);
    } catch (error) {
      logMe("email_helpers.fetch_admin_emails_error", error, "error");
      return [];
    }
  }

  // Assessor task assignment emails
  static async sendAssessorTaskAssignedEmail(assessor, task, creator, application = null) {
    try {
      const appSnippet = application
        ? `<p><strong>Application:</strong> ${application._id} ${application.certificationId?.name ? '(' + application.certificationId.name + ')' : ''}</p>`
        : '';

      const content = `
        <div class="greeting">New Task Assigned, ${assessor.firstName}!</div>
        <div class="message">
          You have been assigned a new task by ${creator.firstName} ${creator.lastName}.
        </div>
        <div class="info-box">
          <h3>Task Details</h3>
          <p><strong>Title:</strong> ${task.title}</p>
          ${task.description ? `<p><strong>Description:</strong> ${task.description}</p>` : ''}
          <p><strong>Priority:</strong> ${task.priority}</p>
          <p><strong>Due Date:</strong> ${task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-AU') : 'Not set'}</p>
          ${appSnippet}
        </div>
        <a href="${process.env.FRONTEND_URL}/assessor/tasks" class="button">View Your Tasks</a>
      `;

      const html = emailService.getBaseTemplate(content, 'New Task Assigned');
      await emailService.sendEmail(assessor.email, 'New Task Assigned', html);
    } catch (error) {
      logMe('email.assessor_task_assigned_error', error, 'error');
    }
  }

  static async sendAssessorTaskReassignedEmail(oldAssessor, newAssessor, task, updater, application = null) {
    try {
      const appSnippet = application
        ? `<p><strong>Application:</strong> ${application._id} ${application.certificationId?.name ? '(' + application.certificationId.name + ')' : ''}</p>`
        : '';

      // Notify new assessor
      const contentNew = `
        <div class="greeting">Task Assigned, ${newAssessor.firstName}!</div>
        <div class="message">
          A task has been assigned to you by ${updater.firstName} ${updater.lastName}.
        </div>
        <div class="info-box">
          <h3>Task Details</h3>
          <p><strong>Title:</strong> ${task.title}</p>
          ${task.description ? `<p><strong>Description:</strong> ${task.description}</p>` : ''}
          <p><strong>Priority:</strong> ${task.priority}</p>
          <p><strong>Due Date:</strong> ${task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-AU') : 'Not set'}</p>
          ${appSnippet}
        </div>
        <a href="${process.env.FRONTEND_URL}/assessor/tasks" class="button">View Task</a>
      `;
      const htmlNew = emailService.getBaseTemplate(contentNew, 'Task Assigned');
      await emailService.sendEmail(newAssessor.email, 'Task Assigned', htmlNew);

      // Optional: notify previous assessor
      if (oldAssessor && oldAssessor.email && oldAssessor._id.toString() !== newAssessor._id.toString()) {
        const contentOld = `
          <div class="greeting">Task Reassigned</div>
          <div class="message">
            A task previously assigned to you has been reassigned by ${updater.firstName} ${updater.lastName}.
          </div>
          <div class="info-box">
            <h3>Task Details</h3>
            <p><strong>Title:</strong> ${task.title}</p>
            ${task.description ? `<p><strong>Description:</strong> ${task.description}</p>` : ''}
            ${appSnippet}
          </div>
        `;
        const htmlOld = emailService.getBaseTemplate(contentOld, 'Task Reassigned');
        await emailService.sendEmail(oldAssessor.email, 'Task Reassigned', htmlOld);
      }
    } catch (error) {
      logMe('email.assessor_task_reassigned_error', error, 'error');
    }
  }

  // Send email to all admins
  static async notifyAdmins(subject, content, templateTitle, rtoConfig = null) {
    try {
      const adminEmails = await this.getAdminEmails();
      
      if (rtoConfig) {
        const { sendRTOEmail } = require("./rtoEmailUtils");
        const promises = adminEmails.map((email) =>
          sendRTOEmail(rtoConfig, email, subject, content)
        );
        return Promise.allSettled(promises);
      } else {
      const promises = adminEmails.map((email) =>
        emailService.sendEmail(
          email,
          subject,
          emailService.getBaseTemplate(content, templateTitle)
        )
      );
      return Promise.allSettled(promises);
      }
    } catch (error) {
      logMe("email.admin_notifications_error", error, "error");
    }
  }

  // Application lifecycle email triggers
  static async handleApplicationCreated(user, application, certification, rtoConfig = null) {
    try {
      // Send welcome email to user using RTO-specific email service
      if (rtoConfig) {
        await sendRTOWelcomeEmail(rtoConfig, user, certification);
      } else {
        // Fallback to default email service
        const emailService = new UnifiedEmailService();
        await emailService.sendWelcomeEmail(user, certification);
      }

      // Notify admins using RTO-specific email service
      const adminEmails = await this.getAdminEmails();
      for (const adminEmail of adminEmails) {
        if (rtoConfig) {
          // Send RTO-specific admin notification
          const branding = rtoConfig.name || "Certified Australia";
          const subject = `New Application - ${user.firstName} ${user.lastName}`;
          const content = `
            <h2>New Application Received</h2>
            <p>A new application has been submitted:</p>
            <ul>
              <li><strong>Student:</strong> ${user.firstName} ${user.lastName}</li>
              <li><strong>Email:</strong> ${user.email}</li>
              <li><strong>Program:</strong> ${certification.name}</li>
              <li><strong>Application ID:</strong> ${application.appCode}</li>
            </ul>
            <p>Please review the application in your admin portal.</p>
          `;
          await sendRTOEmail(rtoConfig, adminEmail, subject, content);
        } else {
          // Fallback to default email service
        await emailService.sendNewApplicationNotificationToAdmin(
          adminEmail,
          user,
          application
        );
        }
      }
    } catch (error) {
      console.error("Error sending application created emails:", error);
      logMe("email.application_created_error", error, "error");
    }
  }

  static async handlePaymentCompleted(user, application, payment, rtoConfig = null) {
    try {
      logMe('email.handle_payment_completed_start', { paymentId: payment._id, user: user.email }, 'debug');
      
      // Send invoice email immediately when payment is completed
      await this.sendPaymentConfirmationEmailIfNeeded(user, application, payment, rtoConfig);

      // Notify admins
      const adminEmails = await this.getAdminEmails();
      for (const adminEmail of adminEmails) {
        await emailService.sendPaymentReceivedNotificationToAdmin(
          adminEmail,
          user,
          payment
        );
      }
      
      logMe('email.handle_payment_completed_complete', { paymentId: payment._id }, 'debug');
    } catch (error) {
      logMe("email.payment_completed_error", error, "error");
    }
  }

  // Helper method to send payment confirmation email only once
  static async sendPaymentConfirmationEmailIfNeeded(user, application, payment, rtoConfig = null) {
    try {
      logMe('email.invoice_check', { paymentId: payment._id, invoiceEmailSent: payment.invoiceEmailSent }, 'debug');
      
      // Skip if invoice email already sent
      if (payment.invoiceEmailSent) {
        logMe('email.invoice_already_sent', { paymentId: payment._id }, 'debug');
        return;
      }

      logMe('email.invoice_send_attempt', { to: user.email, paymentId: payment._id }, 'debug');
      
      // Send confirmation to user using RTO-specific email service
      if (rtoConfig) {
        const { sendRTOPaymentConfirmationEmail } = require("./rtoEmailUtils");
        await sendRTOPaymentConfirmationEmail(rtoConfig, user, payment, application);
      } else {
        // Fallback to default email service
        const emailService = new UnifiedEmailService();
        await emailService.sendPaymentConfirmationEmail(user, application, payment);
      }

      // Mark invoice email as sent
      payment.invoiceEmailSent = true;
      payment.invoiceEmailSentAt = new Date();
      await payment.save();

      logMe('email.invoice_sent', { to: user.email, paymentId: payment._id });
    } catch (error) {
      logMe("email.payment_confirmation_error", { message: error.message, stack: error.stack }, "error");
    }
  }

  // Centralized email trigger system - handles all email scenarios
  static async triggerEmailsForEvent(eventType, user, application, payment = null, formData = null, rtoConfig = null) {
    try {
      logMe('email.trigger_event', { eventType, user: user.email }, 'debug');
      
      switch (eventType) {
        case 'payment_completed':
          // Send invoice email immediately
          if (payment) {
            await this.sendPaymentConfirmationEmailIfNeeded(user, application, payment, rtoConfig);
            // Check if COE should be sent (if enrollment form already exists)
            await this.checkAndSendCOEIfReady(user, application, payment, rtoConfig);
          }
          break;
          
        case 'enrollment_form_submitted':
          // Only send COE if payment exists, no simple enrollment confirmation
          if (payment) {
            await this.checkAndSendCOEIfReady(user, application, payment, formData, rtoConfig);
          } else {
            logMe('email.enrollment_no_payment', { user: user.email }, 'warn');
          }
          break;
          
        default:
          logMe('email.unknown_event', { eventType }, 'warn');
      }
    } catch (error) {
      logMe('email.trigger_event_error', { eventType, message: error?.message }, 'error');
    }
  }

  // Helper method to check and send COE if both payment and enrollment are ready
  static async checkAndSendCOEIfReady(user, application, payment, enrollmentFormData = null, rtoConfig = null) {
    try {
      // Skip if COE already sent
      if (payment.coeSent) {
        logMe('email.coe_already_sent', { paymentId: payment._id }, 'debug');
        return;
      }

      // Check if payment qualifies for COE
      const qualifiesForCOE = payment.isFullyPaid() || 
        (payment.paymentType === 'payment_plan' && payment.paymentPlan?.recurringPayments?.completedPayments > 0);

      if (!qualifiesForCOE) {
        logMe('email.coe_not_qualified', { paymentId: payment._id }, 'debug');
        return;
      }

      // Get enrollment form data
      let formData = enrollmentFormData;
      if (!formData) {
        const FormSubmission = require("../models/formSubmission");
        const FormTemplate = require("../models/formTemplate");
        const EnrolmentFormSelector = require("../utils/enrolmentFormSelector");
        
        // Get the application to check certification and user
        const Application = require("../models/application");
        const User = require("../models/user");
        
        const application = await Application.findById(payment.applicationId).populate('certificationId');
        if (!application) {
          logMe('email.coe_application_not_found', { paymentId: payment._id }, 'warn');
          return;
        }
        
        const user = await User.findById(application.userId);
        if (!user) {
          logMe('email.coe_user_not_found', { applicationId: application._id }, 'warn');
          return;
        }
        
        // Check if this is CPP20218 certification
        const isCPP20218 = application.certificationId._id.toString() === '68b80373c716839c3e29e117';
        
        let enrollmentFormTemplate;
        if (isCPP20218) {
          // Use the correct enrolment form based on international student status
          const enrolmentFormDetails = await EnrolmentFormSelector.getEnrolmentFormDetails(
            application.certificationId._id,
            user.international_student
          );
          enrollmentFormTemplate = await FormTemplate.findById(enrolmentFormDetails.formId);
        } else {
          // For other certifications, find by name
          enrollmentFormTemplate = await FormTemplate.findOne({
            name: { $regex: /enrolment form/i }
          });
        }
        
        if (!enrollmentFormTemplate) {
          logMe('email.coe_no_enrollment_template', {}, 'warn');
          return;
        }

        const enrollmentSubmission = await FormSubmission.findOne({
          applicationId: payment.applicationId,
          formTemplateId: enrollmentFormTemplate._id,
          status: "submitted"
        });
        
        if (!enrollmentSubmission) {
          logMe('email.coe_no_enrollment_submission', { applicationId: payment.applicationId }, 'warn');
          return;
        }
        
        formData = enrollmentSubmission.formData;
      }

      // Send COE using RTO-specific email service
      if (rtoConfig) {
        const { sendRTOCoeEmail } = require("./rtoEmailUtils");
        await sendRTOCoeEmail(rtoConfig, user, application, payment, formData);
      } else {
        // Fallback to default email service
        const emailService = new UnifiedEmailService();
        await emailService.sendCOEEmail(user, application, payment, formData);
      }

      // Mark COE as sent
      payment.coeSent = true;
      payment.coeSentAt = new Date();
      await payment.save();

      logMe('email.coe_sent', { to: user.email, paymentId: payment._id });
    } catch (error) {
      logMe('email.coe_check_send_error', error, 'error');
    }
  }

  // Simple enrollment confirmation email removed - only COE with PDF is sent

  static async handleInstallmentPayment(
    user,
    application,
    payment,
    installmentAmount
  ) {
    try {
      await emailService.sendInstallmentPaymentEmail(
        user,
        application,
        payment,
        installmentAmount
      );
    } catch (error) {
      logMe('email.installment_payment_error', error, 'error');
    }
  }

  // Add this method after handleInstallmentPayment
  static async handleRecurringPayment(
    user,
    application,
    payment,
    installmentNumber
  ) {
    try {
      const remainingPayments =
        payment.paymentPlan.recurringPayments.totalPayments -
        payment.paymentPlan.recurringPayments.completedPayments;

      const content = `
      <div class="greeting">Recurring Payment Processed, ${
        user.firstName
      }!</div>
      <div class="message">
        Your scheduled installment payment has been automatically processed. Thank you for staying current with your payment plan!
      </div>
      
      <div class="info-box">
        <h3>Payment Details</h3>
        <p><strong>Installment:</strong> ${installmentNumber} of ${
        payment.paymentPlan.recurringPayments.totalPayments
      }</p>
        <p><strong>Amount:</strong> $${
          payment.paymentPlan.recurringPayments.amount
        }</p>
        <p><strong>Payment Type:</strong> Automatic Recurring Payment</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-AU')}</p>
        <p><strong>Remaining Payments:</strong> ${remainingPayments}</p>
        <p><strong>Remaining Balance:</strong> $${payment.remainingAmount}</p>
      </div>

      <div class="message">
        ${
          remainingPayments > 0
            ? `Your next payment will be automatically processed on your scheduled date.`
            : `Congratulations! You have completed all payments for your certification.`
        }
      </div>

      <a href="${process.env.FRONTEND_URL}/applications/${
        application._id
      }" class="button">View Payment Progress</a>

      <div class="message">
        You can view your complete payment history and manage your payment plan anytime in your dashboard.
      </div>

      <div class="divider"></div>
      <div style="text-align: center; color: #64748b; font-size: 12px;">
        Powered by Certified.IO
      </div>
    `;

      const htmlContent = emailService.getBaseTemplate(
        content,
        "Recurring Payment Processed"
      );
      await emailService.sendEmail(
        user.email,
        "Recurring Payment Processed - Thank You!",
        htmlContent
      );
    } catch (error) {
      logMe('email.recurring_payment_error', error, 'error');
    }
  }

  static async handleAssessorAssigned(user, application, assessor, rtoConfig = null) {
    try {
      // If no RTO config provided, try to get it from the application
      if (!rtoConfig && application.rtoId) {
        try {
          const RTO = require('../models/rto');
          rtoConfig = await RTO.findById(application.rtoId);
        } catch (error) {
          logMe('email.assessor_assignment_rto_fallback_error', error, 'error');
        }
      }
      
      if (rtoConfig) {
        const { sendRTOEmail } = require("./rtoEmailUtils");
        
      // Notify user about assessor assignment
        const userContent = `
          <h2>Assessor Assigned</h2>
          <p>Dear ${user.firstName} ${user.lastName},</p>
          
          <p>An assessor has been assigned to your application for <strong>${application.certificationId.name}</strong>.</p>
          
          <div style="border-left: 4px solid #1976d2; padding-left: 20px; margin: 30px 0;">
            <h3 style="color: #1976d2; margin-top: 0; font-size: 20px;">Assessment Details:</h3>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Program:</strong> ${application.certificationId.name}</p>
          </div>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">Your assessor will review your application and contact you if needed.</p>
          
          <a href="${process.env.FRONTEND_URL}/student/dashboard" class="button">View Application Status</a>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
          The ${rtoConfig.name} Team at Certified IO</p>
        `;
        
        await sendRTOEmail(rtoConfig, user.email, "Assessor Assigned to Your Application", userContent);

      // Notify assessor about new assignment
        const assessorContent = `
          <h2>New Student Assignment</h2>
          <p>Dear ${assessor.firstName} ${assessor.lastName},</p>
          
          <p>You have been assigned a new student for assessment.</p>
          
          <div style="border-left: 4px solid #1976d2; padding-left: 20px; margin: 30px 0;">
            <h3 style="color: #1976d2; margin-top: 0; font-size: 20px;">Student Details:</h3>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Name:</strong> ${user.firstName} ${user.lastName}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Email:</strong> ${user.email}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Program:</strong> ${application.certificationId.name}</p>
          </div>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">Please log in to your assessor portal to review and complete the assessment.</p>
          
          <a href="${process.env.FRONTEND_URL}/assessor/dashboard" class="button">Access Assessor Portal</a>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
          The ${rtoConfig.name} Team at Certified IO</p>
        `;
        
        await sendRTOEmail(rtoConfig, assessor.email, "New Student Assignment - Action Required", assessorContent);
      } else {
        // Fallback to default email service
        await emailService.sendAssessorAssignedEmail(user, application, assessor);
        await emailService.sendAssessmentReadyNotificationToAssessor(assessor, application, user);
      }
    } catch (error) {
      logMe('email.assessor_assignment_error', error, 'error');
    }
  }

  static async handleFormSubmitted(user, application, formName, rtoConfig = null) {
    try {
      // Debug logging
      logMe('email.form_submission_debug', { 
        rtoConfig: rtoConfig ? { id: rtoConfig._id, name: rtoConfig.name } : null,
        user: user.email,
        application: application.appCode 
      }, 'debug');
      
      // If no RTO config provided, try to get it from the application
      if (!rtoConfig && application.rtoId) {
        try {
          const RTO = require('../models/rto');
          rtoConfig = await RTO.findById(application.rtoId);
          logMe('email.form_submission_rto_fallback', { 
            applicationRtoId: application.rtoId,
            rtoFound: !!rtoConfig,
            rtoName: rtoConfig?.name 
          }, 'debug');
        } catch (error) {
          logMe('email.form_submission_rto_fallback_error', error, 'error');
        }
      }
      
      // Send confirmation to user using RTO-specific email service
      if (rtoConfig) {
        logMe('email.form_submission_rto_service', { 
          rtoCode: rtoConfig.rtoCode,
          rtoName: rtoConfig.name,
          user: user.email,
          application: application.appCode 
        }, 'debug');
        const { sendRTOFormSubmissionEmail } = require("./rtoEmailUtils");
        await sendRTOFormSubmissionEmail(rtoConfig, user, application, formName);
      } else {
        // Fallback to default email service
        logMe('email.form_submission_fallback', { 
          reason: 'No RTO config available',
          user: user.email,
          application: application.appCode 
        }, 'warn');
        const emailService = new UnifiedEmailService();
        await emailService.sendFormSubmissionEmail(user, application, formName);
      }
    } catch (error) {
      logMe('email.form_submission_error', error, 'error');
    }
  }

  static async handleFormResubmissionRequired(
    user,
    application,
    formName,
    feedback,
    rtoConfig = null
  ) {
    try {
      if (rtoConfig) {
        const { sendRTOFormResubmissionRequiredEmail } = require("./rtoEmailUtils");
        await sendRTOFormResubmissionRequiredEmail(rtoConfig, user, application, formName, feedback);
      } else {
        // Fallback to default email service
        const emailService = new UnifiedEmailService();
        await emailService.sendFormResubmissionRequiredEmail(user, application, formName, feedback);
      }
    } catch (error) {
      logMe('email.form_resubmission_error', error, 'error');
    }
  }

  static async handleFormApproval(
    user,
    application,
    formName,
    assessor,
    rtoConfig = null
  ) {
    try {
      if (rtoConfig) {
        const { sendRTOFormApprovalEmail } = require("./rtoEmailUtils");
        await sendRTOFormApprovalEmail(rtoConfig, user, application, formName, assessor);
      } else {
        // Fallback to default email service
        const emailService = new UnifiedEmailService();
        await emailService.sendFormApprovalEmail(user, application, formName, assessor);
      }
    } catch (error) {
      logMe('email.form_approval_error', error, 'error');
    }
  }

  static async handleAssessmentCompleted(user, application, assessor, rtoConfig = null) {
    try {
      if (rtoConfig) {
        const { sendRTOAssessmentCompletionEmail } = require("./rtoEmailUtils");
        await sendRTOAssessmentCompletionEmail(rtoConfig, user, application, assessor);

      // Notify admins
        const adminContent = `
          <h2>Assessment Completed</h2>
          <p>An assessment has been completed and is ready for certificate issuance.</p>
          
          <div style="border-left: 4px solid #1976d2; padding-left: 20px; margin: 30px 0;">
            <h3 style="color: #1976d2; margin-top: 0; font-size: 20px;">Details:</h3>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Qualification:</strong> ${application.certificationId.name}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
          </div>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">Please proceed with certificate generation.</p>
          
          <a href="${process.env.FRONTEND_URL}" class="button">Process Certificate</a>
        `;
        
        await this.notifyAdmins(
          "Assessment Completed - Certificate Processing Required",
          adminContent,
          "Assessment Complete - Admin Action Required",
          rtoConfig
        );
      } else {
        // Fallback to default email service
        const emailService = new UnifiedEmailService();
        await emailService.sendAssessmentCompletionEmail(user, application, assessor);
        
        // Notify admins with default content
      const content = `
        <div class="greeting">Assessment Completed</div>
        <div class="message">
          An assessment has been completed and is ready for certificate issuance.
        </div>
        
        <div class="info-box">
          <h3>Details</h3>
          <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
          <p><strong>Qualification:</strong> ${application.certificationName}</p>
          <p><strong>Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
          <p><strong>Application ID:</strong> ${application.appCode}</p>
        </div>

        <div class="message">
          Please proceed with certificate generation.
        </div>

        <a href="${process.env.FRONTEND_URL}" class="button">Process Certificate</a>
      `;

      await this.notifyAdmins(
        "Assessment Completed - Certificate Processing Required",
        content,
        "Assessment Complete - Admin Action Required"
      );
      }
    } catch (error) {
      logMe('email.assessment_complete_error', error, 'error');
    }
  }

  static async handleCertificateIssued(user, application, certificateUrl, rtoConfig = null) {
    try {
      if (rtoConfig) {
        const { sendRTOCertificateReadyEmail } = require("./rtoEmailUtils");
        await sendRTOCertificateReadyEmail(rtoConfig, user, application, certificateUrl);
        
        // Notify admins for record keeping
        const adminContent = `
          <h2>Certificate Issued</h2>
          <p>A certificate has been successfully issued.</p>
          
          <div style="border-left: 4px solid #1976d2; padding-left: 20px; margin: 30px 0;">
            <h3 style="color: #1976d2; margin-top: 0; font-size: 20px;">Certificate Details:</h3>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Qualification:</strong> ${application.certificationId.name}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Issue Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
          </div>
        `;

        await this.notifyAdmins(
          "Certificate Issued - Record Update",
          adminContent,
          "Certificate Issued",
          rtoConfig
        );
      } else {
        // Fallback to default email service
        const emailService = new UnifiedEmailService();
        await emailService.sendCertificateReadyEmail(user, application, certificateUrl);

      // Notify admins for record keeping
      const content = `
        <div class="greeting">Certificate Issued</div>
        <div class="message">
          A certificate has been successfully issued.
        </div>
        
        <div class="info-box">
          <h3>Certificate Details</h3>
          <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
            <p><strong>Qualification:</strong> ${application.certificationName}</p>
          <p><strong>Issue Date:</strong> ${new Date().toLocaleDateString('en-AU')}</p>
          <p><strong>Application ID:</strong> ${application.appCode}</p>
        </div>
      `;

      await this.notifyAdmins(
        "Certificate Issued - Record Update",
        content,
        "Certificate Issued"
      );
      }
    } catch (error) {
      logMe('email.certificate_issued_error', error, 'error');
    }
  }

  // Payment plan specific emails
  static async handlePaymentPlanSetup(user, application, payment) {
    try {
      const content = `
        <div class="greeting">Payment Plan Activated, ${user.firstName}!</div>
        <div class="message">
          Your payment plan has been successfully set up. Your certification journey can now continue with your scheduled payments.
        </div>
        
        <div class="info-box">
          <h3>Payment Plan Details</h3>
          <p><strong>Total Amount:</strong> $${payment.totalAmount}</p>
          <p><strong>Initial Payment:</strong> $${payment.paymentPlan.initialPayment.amount}</p>
          <p><strong>Installment Amount:</strong> $${payment.paymentPlan.recurringPayments.amount}</p>
          <p><strong>Frequency:</strong> ${payment.paymentPlan.recurringPayments.frequency}</p>
          <p><strong>Total Installments:</strong> ${payment.paymentPlan.recurringPayments.totalPayments}</p>
        </div>

        <div class="message">
          Your next payment will be automatically processed according to your schedule. You can view and manage your payment plan in your dashboard.
        </div>

        <a href="${process.env.FRONTEND_URL}" class="button">View Payment Schedule</a>
      `;

      const htmlContent = emailService.getBaseTemplate(
        content,
        "Payment Plan Activated"
      );
      await emailService.sendEmail(
        user.email,
        "Payment Plan Successfully Activated",
        htmlContent
      );
    } catch (error) {
      logMe('email.payment_plan_setup_error', error, 'error');
    }
  }

  // New method for admin-created payment plan notifications
  static async handlePaymentPlanCreated(user, application, payment, adminUser) {
    try {
      const isPaymentPlan = payment.paymentType === 'payment_plan';
      const startDate = isPaymentPlan && payment.paymentPlan.recurringPayments.startDate 
        ? new Date(payment.paymentPlan.recurringPayments.startDate).toLocaleDateString()
        : 'Not set';

      // Calculate if discount was applied
      const originalPrice = payment.metadata?.originalPrice || payment.totalAmount;
      const discount = payment.metadata?.discount || 0;
      const discountType = payment.metadata?.discountType;
      const hasDiscount = discount > 0;

      const content = `
        <div class="greeting">Payment Plan Created, ${user.firstName}!</div>
        <div class="message">
          An admin has created a custom payment plan for your application. Please review the details below and complete the payment setup to continue with your certification.
        </div>
        
        <div class="info-box">
          <h3>Payment Plan Details</h3>
          <p><strong>Application ID:</strong> ${application.appCode}</p>
          <p><strong>Qualification:</strong> ${application.certificationId?.name || 'Not specified'}</p>
          <p><strong>Payment Type:</strong> ${isPaymentPlan ? 'Payment Plan' : 'One-time Payment'}</p>
          ${hasDiscount ? `
          <p><strong>Original Price:</strong> $${originalPrice}</p>
          <p><strong>Discount Applied:</strong> ${discountType === 'percentage' ? discount + '%' : '$' + discount} ${discountType === 'percentage' ? 'discount' : 'off'}</p>
          ` : ''}
          <p><strong>Total Amount:</strong> $${payment.totalAmount}</p>
          ${isPaymentPlan ? `
          <p><strong>Initial Payment:</strong> $${payment.paymentPlan.initialPayment.amount || 0}</p>
          <p><strong>Installment Amount:</strong> $${payment.paymentPlan.recurringPayments.amount}</p>
          <p><strong>Payment Frequency:</strong> ${payment.paymentPlan.recurringPayments.frequency}</p>
          <p><strong>Total Installments:</strong> ${payment.paymentPlan.recurringPayments.totalPayments}</p>
          <p><strong>Payment Start Date:</strong> ${startDate}</p>
          ` : ''}
          <p><strong>Created by:</strong> Admin Team</p>
        </div>

        ${payment.metadata?.notes ? `
        <div class="info-box" style="background-color: #f0f8ff; border-left-color: #667eea;">
          <h3>Admin Notes</h3>
          <p>${payment.metadata.notes}</p>
        </div>
        ` : ''}

        <div class="message">
          ${isPaymentPlan 
            ? 'To activate your payment plan, you\'ll need to complete the payment setup process. This includes saving your payment method and processing any initial payment if required.'
            : 'To complete your application, please proceed with the one-time payment using the secure payment system.'
          }
        </div>

        <a href="${process.env.FRONTEND_URL}/" class="button">Login to Complete Payment Setup</a>

        <div class="message">
          If you have any questions about your payment plan or need assistance with the setup process, please contact our support team. We're here to help you succeed in your certification journey!
        </div>

        <div class="divider"></div>
        <div style="text-align: center; color: #64748b; font-size: 12px;">
          Powered by Certified.IO
        </div>
      `;

      const htmlContent = emailService.getBaseTemplate(
        content,
        "Payment Plan Created"
      );
      await emailService.sendEmail(
        user.email,
        `Payment Plan Created - Action Required`,
        htmlContent
      );
    } catch (error) {
      logMe('email.payment_plan_created_error', error, 'error');
    }
  }

  // Replace the existing handlePaymentPlanPayment method with this updated version:
  static async handlePaymentPlanPayment(
    user,
    application,
    payment,
    installmentNumber,
    paymentType = "recurring"
  ) {
    try {
      const paymentTypeText =
        paymentType === "early" ? "Early Installment" : "Scheduled Installment";

      const content = `
      <div class="greeting">Payment Received, ${user.firstName}!</div>
      <div class="message">
        Thank you! Your ${paymentTypeText.toLowerCase()} payment has been successfully processed.
      </div>
      
      <div class="info-box">
        <h3>Payment Details</h3>
        <p><strong>Payment Type:</strong> ${paymentTypeText}</p>
        <p><strong>Installment:</strong> ${installmentNumber} of ${
        payment.paymentPlan.recurringPayments.totalPayments
      }</p>
        <p><strong>Amount:</strong> $${
          payment.paymentPlan.recurringPayments.amount
        }</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Remaining Balance:</strong> $${payment.remainingAmount}</p>
      </div>

      <div class="message">
        ${
          payment.remainingAmount > 0
            ? `Your payment plan is progressing well. ${
                paymentType === "early"
                  ? "You can continue with early payments or follow your regular schedule."
                  : "Your next payment will be processed automatically."
              }`
            : `Congratulations! You have completed all payments for your certification.`
        }
      </div>

      <a href="${process.env.FRONTEND_URL}/applications/${
        application._id
      }" class="button">View Payment History</a>

      <div class="divider"></div>
      <div style="text-align: center; color: #64748b; font-size: 12px;">
        Powered by Certified.IO
      </div>
    `;

      const htmlContent = emailService.getBaseTemplate(
        content,
        "Payment Received"
      );
      await emailService.sendEmail(
        user.email,
        `${paymentTypeText} Payment Received - Thank You!`,
        htmlContent
      );
    } catch (error) {
      logMe('email.payment_plan_payment_error', error, 'error');
    }
  }

  // Document verification emails
  static async handleDocumentsSubmitted(user, application) {
    try {
      const content = `
        <div class="greeting">Documents Submitted, ${user.firstName}!</div>
        <div class="message">
          Thank you for submitting your supporting documents. They are now under review by your assigned assessor.
        </div>
        
        <div class="info-box">
          <h3>Next Steps</h3>
          <p><strong>Status:</strong> Under Review</p>
          <p><strong>Application ID:</strong> ${application.appCode}</p>
          <p><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="message">
          Your assessor will verify your documents and may contact you if additional information is needed. You'll receive a notification once the review is complete.
        </div>

        <a href="${process.env.FRONTEND_URL}" class="button">Check Status</a>
      `;

      const htmlContent = emailService.getBaseTemplate(
        content,
        "Documents Submitted"
      );
      await emailService.sendEmail(
        user.email,
        "Documents Submitted for Review",
        htmlContent
      );
    } catch (error) {
      logMe('email.documents_submitted_error', error, 'error');
    }
  }

  static async handleDocumentsVerified(user, application, assessor) {
    try {
      const content = `
        <div class="greeting">Documents Verified, ${user.firstName}!</div>
        <div class="message">
          Great news! Your supporting documents have been verified and approved by your assessor.
        </div>
        
        <div class="info-box">
          <h3>Verification Details</h3>
          <p><strong>Status:</strong> ✅ Verified</p>
          <p><strong>Verified by:</strong> ${assessor.firstName} ${
        assessor.lastName
      }</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="message">
          Your application is progressing well. Continue with any remaining requirements to complete your certification process.
        </div>

        <a href="${process.env.FRONTEND_URL}" class="button">View Progress</a>
      `;

      const htmlContent = emailService.getBaseTemplate(
        content,
        "Documents Verified"
      );
      await emailService.sendEmail(
        user.email,
        "Documents Verified - Application Progressing!",
        htmlContent
      );
    } catch (error) {
      logMe('email.documents_verified_error', error, 'error');
    }
  }

  // Student notification about assessor assignment
  static async handleStudentAssessorAssignment(student, assessor, application, certification) {
    try {
      const content = `
        <div class="greeting">Great News, ${student.firstName}!</div>
        <div class="message">
          Your application has been assigned to a qualified assessor who will guide you through the certification process.
        </div>
        
        <div class="info-box">
          <h3>Your Assessment Team</h3>
          <p><strong>Assigned Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
          <p><strong>Certification:</strong> ${certification.name}</p>
          <p><strong>Application ID:</strong> ${application.appCode}</p>
          <p><strong>Current Status:</strong> ${application.overallStatus || 'Under Review'}</p>
          <p><strong>Assignment Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="message">
          Your assessor will review your application and provide guidance throughout the process. They may reach out to you with questions or requests for additional information.
        </div>

        <a href="${process.env.FRONTEND_URL}/applications/${application._id}" class="button">View Application</a>

        <div class="message">
          Keep an eye on your email and dashboard for updates from your assessor. You're one step closer to achieving your certification!
        </div>

        <div class="divider"></div>
        <div style="text-align: center; color: #64748b; font-size: 12px;">
          Powered by Certified.IO
        </div>
      `;

      const htmlContent = emailService.getBaseTemplate(
        content,
        "Assessor Assigned"
      );
      await emailService.sendEmail(
        student.email,
        "Assessor Assigned to Your Application",
        htmlContent
      );
    } catch (error) {
      logMe('email.student_assessor_assignment_error', error, 'error');
    }
  }

  // Assessor assignment notifications
  static async handleAssessorAssignment(assessor, student, application, certification) {
    try {
      const content = `
        <div class="greeting">New Student Assignment, ${assessor.firstName}!</div>
        <div class="message">
          You have been assigned a new student for assessment. Please review their application and begin the assessment process.
        </div>
        
        <div class="info-box">
          <h3>Assignment Details</h3>
          <p><strong>Student:</strong> ${student.firstName} ${student.lastName}</p>
          <p><strong>Email:</strong> ${student.email}</p>
          <p><strong>Certification:</strong> ${certification.name}</p>
          <p><strong>Application ID:</strong> ${application.appCode}</p>
          <p><strong>Current Status:</strong> ${application.overallStatus || 'Under Review'}</p>
          <p><strong>Assigned Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="message">
          The student has submitted their initial application and is awaiting your assessment. Please log in to review their submission and provide guidance.
        </div>

        <a href="${process.env.FRONTEND_URL}/assessor/applications/${application._id}" class="button">Review Application</a>

        <div class="message">
          You can access all your assigned applications through your assessor dashboard. If you have any questions about this assignment, please contact the administration team.
        </div>

        <div class="divider"></div>
        <div style="text-align: center; color: #64748b; font-size: 12px;">
          Powered by Certified.IO
        </div>
      `;

      const htmlContent = emailService.getBaseTemplate(
        content,
        "New Student Assignment"
      );
      await emailService.sendEmail(
        assessor.email,
        "New Student Assignment - Action Required",
        htmlContent
      );
    } catch (error) {
      logMe('email.assessor_assignment_error', error, 'error');
    }
  }

  // System notification emails
  static async handleSystemMaintenance(maintenanceDetails) {
    try {
      const content = `
        <div class="greeting">Scheduled Maintenance Notification</div>
        <div class="message">
          We will be performing scheduled maintenance on our system. During this time, some services may be temporarily unavailable.
        </div>
        
        <div class="info-box">
          <h3>Maintenance Details</h3>
          <p><strong>Start Time:</strong> ${maintenanceDetails.startTime}</p>
          <p><strong>Duration:</strong> ${maintenanceDetails.duration}</p>
          <p><strong>Affected Services:</strong> ${maintenanceDetails.affectedServices}</p>
        </div>

        <div class="message">
          We apologize for any inconvenience. All services will be fully restored after the maintenance window.
        </div>
      `;

      // Send to all active users
      const users = await User.find({ isActive: true }).select("email");
      const emailPromises = users.map((user) =>
        emailService.sendEmail(
          user.email,
          "Scheduled System Maintenance",
          emailService.getBaseTemplate(content, "System Maintenance")
        )
      );

      return Promise.allSettled(emailPromises);
    } catch (error) {
      logMe('email.maintenance_notification_error', error, 'error');
    }
  }

  // Password reset emails (if not already implemented)
  static async handlePasswordReset(user, resetToken) {
    try {
      const resetUrl = `${process.env.FRONTEND_URL}`;

      const content = `
        <div class="greeting">Password Reset Request, ${user.firstName}</div>
        <div class="message">
          We received a request to reset your password. Click the button below to create a new password.
        </div>
        
        <div class="info-box">
          <h3>Security Notice</h3>
          <p><strong>Valid for:</strong> 10 minutes</p>
          <p><strong>If you didn't request this:</strong> Please ignore this email</p>
        </div>

        <a href="${resetUrl}" class="button">Reset Password</a>

        <div class="message">
          For security reasons, this link will expire in 10 minutes. If you need a new link, please request another password reset.
        </div>
      `;

      const htmlContent = emailService.getBaseTemplate(
        content,
        "Password Reset"
      );
      await emailService.sendEmail(
        user.email,
        "Password Reset Request",
        htmlContent
      );
    } catch (error) {
      logMe('email.password_reset_error', error, 'error');
    }
  }

  // Weekly digest emails
  static async sendWeeklyDigestToAdmins() {
    try {
      const adminEmails = await this.getAdminEmails();
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);

      // Get weekly stats
      const Application = require("../models/application");
      const Payment = require("../models/payment");

      const [newApplications, completedPayments, issuedCertificates] =
        await Promise.all([
          Application.countDocuments({ createdAt: { $gte: weekStart } }),
          Payment.countDocuments({
            status: "completed",
            completedAt: { $gte: weekStart },
          }),
          Application.countDocuments({
            overallStatus: "certificate_issued",
            updatedAt: { $gte: weekStart },
          }),
        ]);

      const content = `
        <div class="greeting">Weekly Summary Report</div>
        <div class="message">
          Here's your weekly summary of platform activity for the week ending ${new Date().toLocaleDateString()}.
        </div>
        
        <div class="info-box">
          <h3>This Week's Highlights</h3>
          <p><strong>New Applications:</strong> ${newApplications}</p>
          <p><strong>Payments Processed:</strong> ${completedPayments}</p>
          <p><strong>Certificates Issued:</strong> ${issuedCertificates}</p>
        </div>

        <div class="message">
          Access your admin dashboard for detailed analytics and reports.
        </div>

        <a href="${process.env.FRONTEND_URL}" class="button">View Dashboard</a>
      `;

      const promises = adminEmails.map((email) =>
        emailService.sendEmail(
          email,
          "Weekly Platform Summary",
          emailService.getBaseTemplate(content, "Weekly Summary")
        )
      );

      return Promise.allSettled(promises);
    } catch (error) {
      logMe('email.weekly_digest_error', error, 'error');
    }
  }

  // Handle resubmission completion notification to assessor
  static async handleResubmissionCompleted(assessor, student, submission, application, certification) {
    try {
      // Debug logging for version tracking
      logMe('email.resubmission_send_attempt', { submissionId: submission._id, version: submission.version, formType: submission.filledBy }, 'debug');
      
      const content = `
        <div class="greeting">Resubmission Alert, ${assessor.firstName}!</div>
        <div class="message">
          A student has completed their resubmission and it's ready for your review. Please assess the updated form submission.
        </div>
        
        <div class="info-box">
          <h3>Resubmission Details</h3>
          <p><strong>Student:</strong> ${student.firstName} ${student.lastName}</p>
          <p><strong>Student Email:</strong> ${student.email}</p>
          <p><strong>Certification:</strong> ${certification.name}</p>
          <p><strong>Application ID:</strong> ${application.appCode}</p>
          <p><strong>Form:</strong> ${submission.formTemplateId.name || 'Form Submission'}</p>
          <p><strong>Step Number:</strong> ${submission.stepNumber}</p>
          <p><strong>Resubmitted At:</strong> ${new Date(submission.submittedAt).toLocaleDateString()}</p>
          <p><strong>Version:</strong> ${submission.version}</p>
          <p><strong>Submission Type:</strong> ${submission.filledBy}</p>
        </div>
        
        <div class="message">
          <strong>Action Required:</strong> Please review the resubmitted form and provide your assessment.
        </div>
        
        <a href="${process.env.FRONTEND_URL}/assessor/applications/${application._id}" class="button">Review Resubmission</a>
      `;
      const htmlContent = emailService.getBaseTemplate(content, "Student Resubmission Completed");
      await emailService.sendEmail(assessor.email, "Resubmission Completed - Review Required", htmlContent);
    } catch (error) {
      logMe('email.resubmission_complete_error', error, 'error');
    }
  }

  // Handle third-party form submission notification to student
  static async handleThirdPartyFormSubmission(student, application, certification, formTemplate, thirdPartyForm, submissionType) {
    try {
      const isCompleted = thirdPartyForm.status === "completed";
      const isPartial = thirdPartyForm.status === "partially_completed";
      
      // Determine who submitted based on submission type
      let submitterInfo = "";
      if (submissionType === "employer") {
        submitterInfo = `Your employer (${thirdPartyForm.employerName})`;
      } else if (submissionType === "reference") {
        submitterInfo = `Your reference (${thirdPartyForm.referenceName})`;
      } else if (submissionType === "combined") {
        submitterInfo = `Your employer/reference (${thirdPartyForm.employerName})`;
      }

      const content = `
        <div class="greeting">Great news, ${student.firstName}!</div>
        <div class="message">
          ${isCompleted 
            ? `Your third-party form has been completed! ${submitterInfo} has successfully submitted their portion of your application.`
            : `${submitterInfo} has submitted their portion of your third-party form. ${thirdPartyForm.isSameEmail ? '' : 'We are still waiting for the other party to complete their submission.'}`
          }
        </div>
        
        <div class="info-box">
          <h3>Submission Details</h3>
          <p><strong>Form:</strong> ${formTemplate.name}</p>
          <p><strong>Certification:</strong> ${certification.name}</p>
          <p><strong>Application ID:</strong> ${application.appCode}</p>
          <p><strong>Submitted By:</strong> ${submitterInfo}</p>
          <p><strong>Submission Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Status:</strong> ${isCompleted ? 'Completed ✅' : 'Partially Completed ⏳'}</p>
          ${!isCompleted && !thirdPartyForm.isSameEmail ? '<p><strong>Pending:</strong> Waiting for other party submission</p>' : ''}
        </div>

        ${isCompleted 
          ? `<div class="message">
               <strong>Next Steps:</strong> Your completed third-party form will now be reviewed by your assigned assessor as part of your application process.
             </div>`
          : `<div class="message">
               <strong>Status Update:</strong> Your application will proceed once all required third-party submissions are received.
             </div>`
        }
        
        <a href="${process.env.FRONTEND_URL}/student/applications/${application._id}" class="button">View Application Status</a>
      `;

      const subject = isCompleted 
        ? "Third-Party Form Completed - Application Update"
        : "Third-Party Form Submission Received - Application Update";

      const htmlContent = emailService.getBaseTemplate(content, "Third-Party Form Submission Update");
      await emailService.sendEmail(student.email, subject, htmlContent);
    } catch (error) {
      logMe('email.third_party_submission_error', error, 'error');
    }
  }
}

module.exports = EmailHelpers;
