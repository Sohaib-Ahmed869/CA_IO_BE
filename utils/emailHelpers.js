// utils/emailHelpers.js
const emailService = require("../services/emailService2");
const User = require("../models/user");

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
      console.error("Error fetching admin emails:", error);
      return [];
    }
  }

  // Send email to all admins
  static async notifyAdmins(subject, content, templateTitle) {
    try {
      const adminEmails = await this.getAdminEmails();
      const promises = adminEmails.map((email) =>
        emailService.sendEmail(
          email,
          subject,
          emailService.getBaseTemplate(content, templateTitle)
        )
      );

      return Promise.allSettled(promises);
    } catch (error) {
      console.error("Error sending admin notifications:", error);
    }
  }

  // Application lifecycle email triggers
  static async handleApplicationCreated(user, application, certification) {
    try {
      // Send welcome email to user
      await emailService.sendWelcomeEmail(user, certification);

      // Notify admins
      const adminEmails = await this.getAdminEmails();
      for (const adminEmail of adminEmails) {
        await emailService.sendNewApplicationNotificationToAdmin(
          adminEmail,
          user,
          application
        );
      }
    } catch (error) {
      console.error("Error sending application created emails:", error);
    }
  }

  static async handlePaymentCompleted(user, application, payment) {
    try {
      console.log(`Starting handlePaymentCompleted for payment ${payment._id}, user ${user.email}`);
      
      // Send invoice email immediately when payment is completed
      await this.sendPaymentConfirmationEmailIfNeeded(user, application, payment);

      // Notify admins
      const adminEmails = await this.getAdminEmails();
      for (const adminEmail of adminEmails) {
        await emailService.sendPaymentReceivedNotificationToAdmin(
          adminEmail,
          user,
          payment
        );
      }
      
      console.log(`Completed handlePaymentCompleted for payment ${payment._id}`);
    } catch (error) {
      console.error("Error sending payment completed emails:", error);
    }
  }

  // Helper method to send payment confirmation email only once
  static async sendPaymentConfirmationEmailIfNeeded(user, application, payment) {
    try {
      console.log(`Checking invoice email for payment ${payment._id}, invoiceEmailSent: ${payment.invoiceEmailSent}`);
      
      // Skip if invoice email already sent
      if (payment.invoiceEmailSent) {
        console.log(`Invoice email already sent for payment ${payment._id}, skipping`);
        return;
      }

      console.log(`Sending invoice email to ${user.email} for payment ${payment._id}`);
      
      // Send confirmation to user
      await emailService.sendPaymentConfirmationEmail(
        user,
        application,
        payment
      );

      // Mark invoice email as sent
      payment.invoiceEmailSent = true;
      payment.invoiceEmailSentAt = new Date();
      await payment.save();

      console.log(`Invoice email sent successfully to ${user.email} for payment ${payment._id}`);
    } catch (error) {
      console.error("Error sending payment confirmation email:", error);
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
    }
  }

  // Centralized email trigger system - handles all email scenarios
  static async triggerEmailsForEvent(eventType, user, application, payment = null, formData = null) {
    try {
      console.log(`Triggering emails for event: ${eventType}, user: ${user.email}`);
      
      switch (eventType) {
        case 'payment_completed':
          // Send invoice email immediately
          if (payment) {
            await this.sendPaymentConfirmationEmailIfNeeded(user, application, payment);
            // Check if COE should be sent (if enrollment form already exists)
            await this.checkAndSendCOEIfReady(user, application, payment);
          }
          break;
          
        case 'enrollment_form_submitted':
          // Only send COE if payment exists, no simple enrollment confirmation
          if (payment) {
            await this.checkAndSendCOEIfReady(user, application, payment, formData);
          } else {
            console.log(`Enrollment form submitted but no payment found for user ${user.email}`);
          }
          break;
          
        default:
          console.log(`Unknown event type: ${eventType}`);
      }
    } catch (error) {
      console.error(`Error triggering emails for event ${eventType}:`, error);
    }
  }

  // Helper method to check and send COE if both payment and enrollment are ready
  static async checkAndSendCOEIfReady(user, application, payment, enrollmentFormData = null) {
    try {
      // Skip if COE already sent
      if (payment.coeSent) {
        console.log(`COE already sent for payment ${payment._id}, skipping`);
        return;
      }

      // Check if payment qualifies for COE
      const qualifiesForCOE = payment.isFullyPaid() || 
        (payment.paymentType === 'payment_plan' && payment.paymentPlan?.recurringPayments?.completedPayments > 0);

      if (!qualifiesForCOE) {
        console.log(`Payment ${payment._id} does not qualify for COE yet`);
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
          console.log(`Application not found for payment ${payment._id}`);
          return;
        }
        
        const user = await User.findById(application.userId);
        if (!user) {
          console.log(`User not found for application ${application._id}`);
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
          console.log("No enrollment form template found");
          return;
        }

        const enrollmentSubmission = await FormSubmission.findOne({
          applicationId: payment.applicationId,
          formTemplateId: enrollmentFormTemplate._id,
          status: "submitted"
        });
        
        if (!enrollmentSubmission) {
          console.log(`No enrollment form submission found for application ${payment.applicationId}`);
          return;
        }
        
        formData = enrollmentSubmission.formData;
      }

      // Send COE
      const emailService = require("../services/emailService2");
      await emailService.sendCOEEmail(
        user,
        application,
        payment,
        formData
      );

      // Mark COE as sent
      payment.coeSent = true;
      payment.coeSentAt = new Date();
      await payment.save();

      console.log(`COE email sent to ${user.email} for payment ${payment._id}`);
    } catch (error) {
      console.error("Error checking and sending COE:", error);
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
      console.error("Error sending installment payment email:", error);
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
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
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
      console.error("Error sending recurring payment email:", error);
    }
  }

  static async handleAssessorAssigned(user, application, assessor) {
    try {
      // Notify user about assessor assignment
      await emailService.sendAssessorAssignedEmail(user, application, assessor);

      // Notify assessor about new assignment
      await emailService.sendAssessmentReadyNotificationToAssessor(
        assessor,
        application,
        user
      );
    } catch (error) {
      console.error("Error sending assessor assignment emails:", error);
    }
  }

  static async handleFormSubmitted(user, application, formName) {
    try {
      // Send confirmation to user
      await emailService.sendFormSubmissionEmail(user, application, formName);
    } catch (error) {
      console.error("Error sending form submission email:", error);
    }
  }

  static async handleFormResubmissionRequired(
    user,
    application,
    formName,
    feedback
  ) {
    try {
      // Notify user about required changes
      await emailService.sendFormResubmissionRequiredEmail(
        user,
        application,
        formName,
        feedback
      );
    } catch (error) {
      console.error("Error sending form resubmission email:", error);
    }
  }

  static async handleAssessmentCompleted(user, application, assessor) {
    try {
      // Notify user about completion
      await emailService.sendAssessmentCompletionEmail(
        user,
        application,
        assessor
      );

      // Notify admins
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
          <p><strong>Application ID:</strong> ${application._id}</p>
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
    } catch (error) {
      console.error("Error sending assessment completion emails:", error);
    }
  }

  static async handleCertificateIssued(user, application, certificateUrl) {
    try {
      // Notify user about certificate
      await emailService.sendCertificateReadyEmail(
        user,
        application,
        certificateUrl
      );

      // Notify admins for record keeping
      const content = `
        <div class="greeting">Certificate Issued</div>
        <div class="message">
          A certificate has been successfully issued.
        </div>
        
        <div class="info-box">
          <h3>Certificate Details</h3>
          <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
          <p><strong>Qualification:</strong> ${
            application.certificationName
          }</p>
          <p><strong>Issue Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Application ID:</strong> ${application._id}</p>
        </div>
      `;

      await this.notifyAdmins(
        "Certificate Issued - Record Update",
        content,
        "Certificate Issued"
      );
    } catch (error) {
      console.error("Error sending certificate issued emails:", error);
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
      console.error("Error sending payment plan setup email:", error);
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
          <p><strong>Application ID:</strong> ${application._id}</p>
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
      console.error("Error sending payment plan created email:", error);
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
      console.error("Error sending payment plan payment email:", error);
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
          <p><strong>Application ID:</strong> ${application._id}</p>
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
      console.error("Error sending documents submitted email:", error);
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
      console.error("Error sending documents verified email:", error);
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
          <p><strong>Application ID:</strong> ${application._id}</p>
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
      console.error("Error sending student assessor assignment email:", error);
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
          <p><strong>Application ID:</strong> ${application._id}</p>
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
      console.error("Error sending assessor assignment email:", error);
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
      console.error("Error sending maintenance notification emails:", error);
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
      console.error("Error sending password reset email:", error);
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
      console.error("Error sending weekly digest emails:", error);
    }
  }

  // Handle resubmission completion notification to assessor
  static async handleResubmissionCompleted(assessor, student, submission, application, certification) {
    try {
      // Debug logging for version tracking
      console.log(`Sending resubmission email - Submission ID: ${submission._id}, Version: ${submission.version}, FormType: ${submission.filledBy}`);
      
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
          <p><strong>Application ID:</strong> ${application._id}</p>
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
      console.error("Error sending resubmission completion email:", error);
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
          <p><strong>Application ID:</strong> ${application._id}</p>
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
      console.error("Error sending third-party form submission email:", error);
    }
  }
}

module.exports = EmailHelpers;
