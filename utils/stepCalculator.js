// utils/stepCalculator.js
const Application = require("../models/application");
const Certification = require("../models/certification");
const FormTemplate = require("../models/formTemplate");
const FormSubmission = require("../models/formSubmission");
const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
const DocumentUpload = require("../models/documentUpload");
const Payment = require("../models/payment");

/**
 * Dynamic Step Calculator for Applications
 * 
 * Fixed Steps (always present):
 * 1. Payment
 * 2. Document Upload
 * 3. Evidence Upload (images/videos in document upload)
 * 
 * Dynamic Steps (based on certification forms):
 * - Each form template in certification creates a step
 * - Third-party forms (filledBy: "third-party")
 * - User forms (filledBy: "user") 
 * - Assessor forms (filledBy: "assessor")
 * - Mapping forms (filledBy: "mapping")
 * 
 * Final Steps:
 * - Assessment (if assessor forms exist)
 * - Certificate Issue
 */

class StepCalculator {
  constructor(application) {
    this.application = application;
    this.steps = [];
    this.currentStep = 1;
    this.totalSteps = 0;
  }

  /**
   * Calculate all steps for an application
   */
  async calculateSteps() {
    // Get all related data
    const [populatedApplication, formSubmissions, thirdPartySubmissions, documentUpload, payment] = await Promise.all([
      Application.findById(this.application._id).populate({
        path: "certificationId",
        populate: {
          path: "formTemplateIds.formTemplateId",
          model: "FormTemplate"
        }
      }),
      FormSubmission.find({ applicationId: this.application._id }),
      ThirdPartyFormSubmission.find({ applicationId: this.application._id }),
      DocumentUpload.findOne({ applicationId: this.application._id }),
      Payment.findOne({ applicationId: this.application._id })
    ]);

    // Update the application reference with populated data
    const certification = populatedApplication;

    // Initialize steps array
    this.steps = [];

    // STEP 1: Always Payment
    this.steps.push({
      stepNumber: 1,
      type: "payment",
      title: "Payment",
      isRequired: true,
      isCompleted: payment ? payment.isFullyPaid() : false,
      status: this._getPaymentStatus(payment),
      metadata: {
        paymentType: payment?.paymentType || "pending",
        totalAmount: payment?.totalAmount || 0,
        remainingAmount: payment?.remainingAmount || 0
      }
    });

    // DYNAMIC STEPS: Forms (sorted by stepNumber, deduplicated)
    if (certification.certificationId?.formTemplateIds?.length > 0) {
      // Remove duplicates by formTemplateId
      const uniqueForms = certification.certificationId.formTemplateIds.filter((form, index, self) =>
        index === self.findIndex(f => f.formTemplateId._id.toString() === form.formTemplateId._id.toString())
      );
      
      const sortedForms = [...uniqueForms].sort((a, b) => a.stepNumber - b.stepNumber);
      
      for (const formConfig of sortedForms) {
        const stepNumber = this.steps.length + 1;
        const formTemplate = formConfig.formTemplateId;
        
        // Find submission for this form
        let submission = null;
        let isCompleted = false;
        
        if (formConfig.filledBy === "third-party") {
          submission = thirdPartySubmissions.find(s => 
            s.formTemplateId.toString() === formTemplate._id.toString()
          );
          isCompleted = submission?.status === "completed" || submission?.isFullyCompleted;
        } else {
          submission = formSubmissions.find(s => 
            s.formTemplateId.toString() === formTemplate._id.toString()
          );
          isCompleted = submission?.status === "submitted" || submission?.status === "assessed";
        }

        this.steps.push({
          stepNumber,
          type: "form",
          title: formConfig.title || formTemplate.name,
          isRequired: true,
          isCompleted,
          status: this._getFormStatus(submission, formConfig.filledBy),
          filledBy: formConfig.filledBy,
          formTemplateId: formTemplate._id,
          submissionId: submission?._id || null,
          metadata: {
            formType: formTemplate.stepNumber,
            submittedAt: submission?.submittedAt || submission?.createdAt,
            assessmentRequired: formConfig.filledBy === "user" || formConfig.filledBy === "mapping"
          }
        });
      }
    }

    // FIXED STEP: Document Upload (always after forms)
    const docStepNumber = this.steps.length + 1;
    const hasDocuments = documentUpload?.documents?.length > 0;
    const documentCount = documentUpload?.documents?.length || 0;
    
    this.steps.push({
      stepNumber: docStepNumber,
      type: "document_upload",
      title: "Document Upload",
      isRequired: true,
      isCompleted: hasDocuments,
      status: hasDocuments ? "completed" : "pending",
      metadata: {
        documentCount,
        uploadedAt: documentUpload?.updatedAt,
        verificationStatus: documentUpload?.status
      }
    });

    // FIXED STEP: Evidence Upload (images/videos)
    const evidenceStepNumber = this.steps.length + 1;
    const imageCount = documentUpload?.getImageCount() || 0;
    const videoCount = documentUpload?.getVideoCount() || 0;
    const hasEvidence = imageCount > 0 || videoCount > 0;

    this.steps.push({
      stepNumber: evidenceStepNumber,
      type: "evidence_upload",
      title: "Evidence Upload",
      isRequired: true,
      isCompleted: hasEvidence,
      status: hasEvidence ? "completed" : "pending",
      metadata: {
        imageCount,
        videoCount,
        totalEvidenceCount: imageCount + videoCount
      }
    });

    // CONDITIONAL STEP: Assessment (only if there are assessor forms or user forms)
    const hasAssessorForms = certification.certificationId?.formTemplateIds?.some(f => f.filledBy === "assessor");
    const hasUserForms = certification.certificationId?.formTemplateIds?.some(f => f.filledBy === "user" || f.filledBy === "mapping");
    
    if (hasAssessorForms || hasUserForms) {
      const assessmentStepNumber = this.steps.length + 1;
      const assessmentCompleted = this.application.overallStatus === "assessment_completed" || 
                                  this.application.overallStatus === "certificate_issued" ||
                                  this.application.overallStatus === "completed";

      this.steps.push({
        stepNumber: assessmentStepNumber,
        type: "assessment",
        title: "Assessment",
        isRequired: true,
        isCompleted: assessmentCompleted,
        status: this._getAssessmentStatus(),
        metadata: {
          assignedAssessor: this.application.assignedAssessor,
          hasAssessorForms,
          hasUserForms
        }
      });
    }

    // FINAL STEP: Certificate Issue
    const certificateStepNumber = this.steps.length + 1;
    const certificateIssued = this.application.finalCertificate?.s3Key !== null || 
                             this.application.overallStatus === "certificate_issued" ||
                             this.application.overallStatus === "completed";

    this.steps.push({
      stepNumber: certificateStepNumber,
      type: "certificate",
      title: "Certificate Issue",
      isRequired: true,
      isCompleted: certificateIssued,
      status: certificateIssued ? "completed" : "pending",
      metadata: {
        certificateNumber: this.application.finalCertificate?.certificateNumber,
        issuedAt: this.application.finalCertificate?.uploadedAt,
        expiryDate: this.application.finalCertificate?.expiryDate
      }
    });

    // Calculate current step and totals
    this.totalSteps = this.steps.length;
    this.currentStep = this._calculateCurrentStep();

    return {
      currentStep: this.currentStep,
      totalSteps: this.totalSteps,
      steps: this.steps,
      progressPercentage: Math.round((this.currentStep / this.totalSteps) * 100),
      overallStatus: this._calculateOverallStatus()
    };
  }

  /**
   * Calculate the current step number based on completion
   */
  _calculateCurrentStep() {
    // Find the first incomplete step
    for (let i = 0; i < this.steps.length; i++) {
      if (!this.steps[i].isCompleted) {
        return this.steps[i].stepNumber;
      }
    }
    // If all steps are completed, return the last step
    return this.totalSteps;
  }

  /**
   * Calculate overall application status
   */
  _calculateOverallStatus() {
    const completedSteps = this.steps.filter(step => step.isCompleted).length;
    
    if (completedSteps === 0) {
      return "payment_pending";
    } else if (completedSteps === this.totalSteps) {
      return "completed";
    } else {
      // Check specific conditions
      const paymentCompleted = this.steps[0]?.isCompleted;
      const formsCompleted = this.steps.filter(s => s.type === "form").every(s => s.isCompleted);
      const documentsCompleted = this.steps.find(s => s.type === "document_upload")?.isCompleted;
      const evidenceCompleted = this.steps.find(s => s.type === "evidence_upload")?.isCompleted;
      const assessmentStep = this.steps.find(s => s.type === "assessment");
      
      if (!paymentCompleted) {
        return "payment_pending";
      } else if (paymentCompleted && !formsCompleted) {
        return "in_progress";
      } else if (formsCompleted && (!documentsCompleted || !evidenceCompleted)) {
        return "in_progress";
      } else if (assessmentStep && !assessmentStep.isCompleted) {
        return "assessment_pending";
      } else {
        return "assessment_completed";
      }
    }
  }

  /**
   * Get payment status
   */
  _getPaymentStatus(payment) {
    if (!payment) return "pending";
    if (payment.isFullyPaid()) return "completed";
    if (payment.status === "processing") return "processing";
    if (payment.status === "failed") return "failed";
    return "pending";
  }

  /**
   * Get form status
   */
  _getFormStatus(submission, filledBy) {
    if (!submission) return "pending";
    
    if (filledBy === "third-party") {
      return submission.status; // "completed" or "pending"
    } else {
      if (submission.status === "submitted" || submission.status === "assessed") {
        return "completed";
      }
      return submission.status; // "pending", "in_progress"
    }
  }

  /**
   * Get assessment status
   */
  _getAssessmentStatus() {
    if (this.application.overallStatus === "assessment_completed") return "completed";
    if (this.application.overallStatus === "assessment_pending") return "in_progress";
    if (this.application.assignedAssessor) return "assigned";
    return "pending";
  }

  /**
   * Update application step in database
   */
  async updateApplicationStep() {
    const result = await this.calculateSteps();
    
    await Application.findByIdAndUpdate(this.application._id, {
      currentStep: result.currentStep,
      overallStatus: result.overallStatus
    });

    return result;
  }
}

/**
 * Static method to calculate steps for an application
 */
const calculateApplicationSteps = async (applicationId) => {
  const application = await Application.findById(applicationId);
  if (!application) {
    throw new Error("Application not found");
  }

  const calculator = new StepCalculator(application);
  return await calculator.calculateSteps();
};

/**
 * Static method to update application step
 */
const updateApplicationStep = async (applicationId) => {
  const application = await Application.findById(applicationId);
  if (!application) {
    throw new Error("Application not found");
  }

  const calculator = new StepCalculator(application);
  return await calculator.updateApplicationStep();
};

module.exports = {
  StepCalculator,
  calculateApplicationSteps,
  updateApplicationStep
};
