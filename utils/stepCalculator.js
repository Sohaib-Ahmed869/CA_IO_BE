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
      actor: "student",
      isUserVisible: true,
      metadata: {
        paymentType: payment?.paymentType || "pending",
        totalAmount: payment?.totalAmount || 0,
        remainingAmount: payment?.remainingAmount || 0
      }
    });

    // DYNAMIC STEPS: Forms (sorted by stepNumber, deduplicated, active only)
    if (certification.certificationId?.formTemplateIds?.length > 0) {
      // Remove duplicates by formTemplateId and filter out inactive forms
      const uniqueForms = certification.certificationId.formTemplateIds.filter((form, index, self) =>
        index === self.findIndex(f => f.formTemplateId._id.toString() === form.formTemplateId._id.toString()) &&
        form.formTemplateId.isActive !== false // Only include active forms
      );
      
      const sortedForms = [...uniqueForms].sort((a, b) => a.stepNumber - b.stepNumber);
      
      for (const formConfig of sortedForms) {
        const stepNumber = this.steps.length + 1;
        const formTemplate = formConfig.formTemplateId;
        
        // Find submission for this form
        let submission = null;
        let isCompleted = false;
        
        if (formConfig.filledBy === "third-party") {
          const thirdPartySubmission = thirdPartySubmissions.find(s => 
            s.formTemplateId.toString() === formTemplate._id.toString()
          );
          
          // For third-party forms, also check FormSubmission for resubmission/version
          const formSubmission = formSubmissions.find(s => 
            s.formTemplateId.toString() === formTemplate._id.toString() && 
            s.filledBy === "third-party"
          );
          
          const status = this._getThirdPartyStatus(thirdPartySubmission, formSubmission);
          isCompleted = status === "completed";
          
          // For downstream metadata and IDs, prefer FormSubmission if it exists
          submission = formSubmission || thirdPartySubmission;
        } else {
          submission = formSubmissions.find(s => 
            s.formTemplateId.toString() === formTemplate._id.toString()
          );
          
          // For user/assessor forms: completed if submitted/assessed AND not requiring resubmission
          isCompleted = (submission?.status === "submitted" || submission?.status === "assessed") &&
                        (submission?.resubmissionRequired !== true);
        }

        this.steps.push({
          stepNumber,
          type: "form",
          title: formConfig.title || formTemplate.name,
          isRequired: true,
          isCompleted,
          status: formConfig.filledBy === "third-party" 
            ? this._getThirdPartyStatus(
                thirdPartySubmissions.find(s => s.formTemplateId.toString() === formTemplate._id.toString()),
                formSubmissions.find(s => s.formTemplateId.toString() === formTemplate._id.toString() && s.filledBy === "third-party")
              )
            : this._getFormStatus(submission, formConfig.filledBy),
          filledBy: formConfig.filledBy,
          formTemplateId: formTemplate._id,
          submissionId: submission?._id || null,
          actor: (formConfig.filledBy === "user") ? "student" : (formConfig.filledBy === "third-party" ? "third_party" : "assessor"),
          isUserVisible: (formConfig.filledBy === "user" || formConfig.filledBy === "third-party"),
          metadata: {
            certificationStepNumber: formConfig.stepNumber, // Use certification's stepNumber
            submittedAt: submission?.submittedAt || submission?.createdAt,
            assessmentRequired: formConfig.filledBy === "user" || formConfig.filledBy === "mapping",
            resubmissionRequired: submission?.resubmissionRequired === true,
            resubmissionDeadline: submission?.resubmissionDeadline,
            version: submission?.version || 1,
            assessorFeedback: submission?.assessorFeedback,
            assessed: submission?.assessed
          }
        });
      }
    }

    // FIXED STEP: Document Upload (always after forms)
    const docStepNumber = this.steps.length + 1;
    const allDocs = documentUpload?.documents || [];
    const nonMediaDocs = allDocs.filter(doc => {
      const mt = doc?.mimeType || "";
      return !(mt.startsWith("image/") || mt.startsWith("video/"));
    });
    const mediaDocs = allDocs.filter(doc => {
      const mt = doc?.mimeType || "";
      return (mt.startsWith("image/") || mt.startsWith("video/"));
    });

    // Documents (non-media)
    let documentCount = nonMediaDocs.length;
    const hasDocuments = documentCount > 0;
    const rejectedDocuments = nonMediaDocs.some(d => d.verificationStatus === "rejected");
    const pendingDocuments = nonMediaDocs.some(d => (d.verificationStatus || "pending") === "pending");
    const verifiedDocuments = nonMediaDocs.length > 0 && nonMediaDocs.every(d => d.isVerified === true);
    // Business rule: any rejection puts documents into resubmission until fully re-verified
    const documentResubmissionRequired = rejectedDocuments;
    // Business rule: when in resubmission, reset progress to 0
    if (documentResubmissionRequired) {
      documentCount = 0;
    }
    
    this.steps.push({
      stepNumber: docStepNumber,
      type: "document_upload",
      title: "Document Upload",
      isRequired: true,
      // Business rule: complete when 8+ documents uploaded and no resubmission
      isCompleted: documentCount >= 8 && !documentResubmissionRequired,
      status: (documentResubmissionRequired)
          ? "resubmission_required"
          : (documentCount > 0
              ? (documentCount >= 8 ? "completed" : "in_progress")
              : "not_started"),
      actor: "student",
      isUserVisible: true,
      metadata: {
        documentCount,
        totalRequired: 8, // Updated rule: require 8 documents
        uploadedAt: documentUpload?.updatedAt,
        verificationStatus: documentUpload?.status || "pending"
      }
    });

    // FIXED STEP: Evidence Upload (images/videos)
    const evidenceStepNumber = this.steps.length + 1;
    // Count only true evidence items by documentType
    let imageCount = mediaDocs.filter(d => d.documentType === "photo_evidence").length;
    let videoCount = mediaDocs.filter(d => d.documentType === "video_demonstration").length;
    const hasEvidence = imageCount > 0 || videoCount > 0;
    const rejectedEvidence = mediaDocs.some(d => d.verificationStatus === "rejected");
    const pendingEvidence = mediaDocs.some(d => (d.verificationStatus || "pending") === "pending");
    const verifiedEvidence = mediaDocs.length > 0 && mediaDocs.every(d => d.isVerified === true);
    
    // Check if evidence requirements are met (20 images min + 5 videos min)
    // Business rule: any rejection puts evidence into resubmission until fully re-verified
    const evidenceResubmissionRequired = rejectedEvidence;
    // When evidence in resubmission, reset progress counts to 0
    if (evidenceResubmissionRequired) {
      imageCount = 0;
      videoCount = 0;
    }

    // Thresholds from env with defaults
    const MIN_IMAGES = parseInt(process.env.MIN_IMAGES || "20", 10);
    const MIN_VIDEOS = parseInt(process.env.MIN_VIDEOS || "5", 10);
    const MAX_IMAGES = parseInt(process.env.MAX_IMAGES || "30", 10);
    const MAX_VIDEOS = parseInt(process.env.MAX_VIDEOS || "12", 10);

    const evidenceRequirementsMet = imageCount >= MIN_IMAGES && videoCount >= MIN_VIDEOS;
    
    // Check if evidence exceeds maximum limits
    const evidenceExceedsMax = imageCount > MAX_IMAGES || videoCount > MAX_VIDEOS;

    this.steps.push({
      stepNumber: evidenceStepNumber,
      type: "evidence_upload",
      title: "Evidence Upload",
      isRequired: true,
      isCompleted: evidenceRequirementsMet && !evidenceResubmissionRequired && !evidenceExceedsMax,
      status: (evidenceResubmissionRequired)
          ? "resubmission_required"
          : (evidenceExceedsMax
              ? "exceeds_limit"
              : (evidenceRequirementsMet
                  ? "submitted"
                  : (hasEvidence ? "partially_submitted" : "not_started"))),
      actor: "student",
      isUserVisible: true,
      metadata: {
        imageCount,
        videoCount,
        totalEvidenceCount: imageCount + videoCount,
        totalRequiredImages: MIN_IMAGES, // Minimum required images
        totalRequiredVideos: MIN_VIDEOS,  // Minimum required videos
        maxImages: MAX_IMAGES,           // Maximum allowed images
        maxVideos: MAX_VIDEOS,           // Maximum allowed videos
        requirementsMet: evidenceRequirementsMet,
        exceedsLimit: evidenceExceedsMax,
        uploadedAt: documentUpload?.updatedAt
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
        actor: "assessor",
        isUserVisible: false,
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
      actor: "admin",
      isUserVisible: false,
      metadata: {
        certificateNumber: this.application.finalCertificate?.certificateNumber,
        issuedAt: this.application.finalCertificate?.uploadedAt,
        expiryDate: this.application.finalCertificate?.expiryDate
      }
    });

    // Calculate current step and totals
    this.totalSteps = this.steps.length;
    this.currentStep = this._calculateCurrentStep();

    // Derive user-only view (hide assessor/admin steps)
    const userSteps = this.steps.filter(s => s.isUserVisible);
    const userTotalSteps = userSteps.length;
    let userCurrentStep = 1;
    for (let i = 0; i < userSteps.length; i++) {
      if (!userSteps[i].isCompleted) {
        userCurrentStep = userSteps[i].stepNumber; // keep same numbering so UI matches main list
        break;
      }
      if (i === userSteps.length - 1) userCurrentStep = userSteps[i].stepNumber;
    }
    const userCompletedSteps = userSteps.filter(s => s.isCompleted).length;
    const userProgressPercentage = userTotalSteps > 0 ? Math.round((userCompletedSteps / userTotalSteps) * 100) : 0;

    return {
      currentStep: this.currentStep,
      totalSteps: this.totalSteps,
      steps: this.steps,
      progressPercentage: Math.round((this.currentStep / this.totalSteps) * 100),
      overallStatus: this._calculateOverallStatus(),
      userView: {
        currentStep: userCurrentStep,
        totalSteps: userTotalSteps,
        completedSteps: userCompletedSteps,
        progressPercentage: userProgressPercentage
      }
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
    if (!payment) return "payment_required";
    if (payment.isFullyPaid()) return "completed";
    if (payment.status === "processing") return "processing";
    if (payment.status === "failed") return "failed";
    if (payment.status === "pending") return "payment_required";
    return "payment_required";
  }

  /**
   * Get form status with resubmission handling
   */
  _getFormStatus(submission, filledBy) {
    if (!submission) return "not_started";
    
    // Check for resubmission requirement first
    if (submission.resubmissionRequired === true) {
      return "resubmission_required";
    }
    
    if (filledBy === "third-party") {
      if (submission.status === "completed") {
        return "completed";
      } else if (submission.status === "pending") {
        return "in_progress";
      }
      return "not_started";
    } else {
      if (submission.status === "submitted" || submission.status === "assessed") {
        return "completed";
      } else if (submission.status === "in_progress") {
        return "in_progress";
      }
      return "not_started";
    }
  }

  /**
   * Determine third-party step status from ThirdPartyFormSubmission and FormSubmission
   */
  _getThirdPartyStatus(thirdPartySubmission, formSubmission) {
    // If assessor requested resubmission on the backed FormSubmission
    if (formSubmission?.resubmissionRequired === true) {
      return "resubmission_required";
    }
    // If third party has completed fully
    if (thirdPartySubmission?.status === "completed" || thirdPartySubmission?.isFullyCompleted) {
      return "completed";
    }
    // If partially completed by one side
    if (thirdPartySubmission?.status === "partially_completed" ||
        thirdPartySubmission?.employerSubmission?.isSubmitted ||
        thirdPartySubmission?.referenceSubmission?.isSubmitted ||
        thirdPartySubmission?.combinedSubmission?.isSubmitted) {
      return "in_progress";
    }
    return "not_started";
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
