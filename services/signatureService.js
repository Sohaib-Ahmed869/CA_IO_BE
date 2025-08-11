// services/signatureService.js
const Signature = require("../models/signature");
const FormSubmission = require("../models/formSubmission");
const FormTemplate = require("../models/formTemplate");
const logme = require("../utils/logger");
const signatureController = require("../controllers/signatureController");

class SignatureService {
  // Clean up expired signatures
  static async cleanupExpiredSignatures() {
    try {
      const result = await signatureController.cleanupExpiredSignatures();
      return result;
    } catch (error) {
      logme.error("Signature cleanup error:", error);
      throw error;
    }
  }

  // Get signatures for a form submission with validation
  static async getSubmissionSignatures(submissionId, rtoId) {
    try {
      const signatures = await Signature.find({
        submissionId,
        ...(rtoId && { rtoId })
      })
        .populate("userId", "firstName lastName email")
        .sort({ createdAt: 1 });

      // Validate each signature
      const validatedSignatures = signatures.map(signature => {
        const validation = signature.validateSignature();
        return {
          ...signature.toObject(),
          validation
        };
      });

      return validatedSignatures;
    } catch (error) {
      logme.error("Get submission signatures error:", error);
      throw error;
    }
  }

  // Check if all required signatures are completed for a submission
  static async checkSubmissionSignatureStatus(submissionId, rtoId) {
    try {
      const submission = await FormSubmission.findOne({
        _id: submissionId,
        ...(rtoId && { rtoId })
      }).populate("formTemplateId");

      if (!submission) {
        throw new Error("Submission not found");
      }

      const form = submission.formTemplateId;
      const signatures = await Signature.find({
        submissionId,
        ...(rtoId && { rtoId })
      });

      // Check if form has signature fields
      const hasSignatureFields = form.formStructure && this.hasSignatureFieldsInStructure(form.formStructure);

      if (!hasSignatureFields) {
        return {
          hasSignatures: false,
          allCompleted: true,
          signatures: []
        };
      }

      const signatureFields = this.extractSignatureFieldsFromStructure(form.formStructure);
      const completedSignatures = signatures.filter(sig => sig.status === 'completed');
      const pendingSignatures = signatures.filter(sig => sig.status === 'pending');
      const expiredSignatures = signatures.filter(sig => sig.status === 'expired');

      const allCompleted = completedSignatures.length === signatureFields.length;

      return {
        hasSignatures: true,
        allCompleted,
        totalRequired: signatureFields.length,
        completed: completedSignatures.length,
        pending: pendingSignatures.length,
        expired: expiredSignatures.length,
        signatures: signatures.map(sig => ({
          ...sig.toObject(),
          validation: sig.validateSignature()
        }))
      };
    } catch (error) {
      logme.error("Check submission signature status error:", error);
      throw error;
    }
  }

  // Helper method to check if form structure has signature fields
  static hasSignatureFieldsInStructure(structure) {
    if (!structure) return false;
    
    const checkForSignatures = (items) => {
      if (Array.isArray(items)) {
        return items.some(item => {
          if (item && typeof item === 'object') {
            if (item.type === 'signature') return true;
            if (item.fields) return checkForSignatures(item.fields);
            if (item.sections) return checkForSignatures(item.sections);
          }
          return false;
        });
      }
      return false;
    };

    return checkForSignatures(structure);
  }

  // Extract signature fields from form structure
  static extractSignatureFieldsFromStructure(structure) {
    if (!structure) return [];
    
    const signatureFields = [];
    const extractFields = (items) => {
      if (Array.isArray(items)) {
        items.forEach(item => {
          if (item && typeof item === 'object') {
            // Check if this item is a signature field (check both type and fieldType)
            if (item.type === 'signature' || item.fieldType === 'signature') {
              signatureFields.push({
                fieldName: item.fieldName || item.name,
                label: item.label,
                type: item.type || item.fieldType
              });
            }
            
            // Recursively check nested structures
            if (item.fields && Array.isArray(item.fields)) {
              extractFields(item.fields);
            }
            if (item.sections && Array.isArray(item.sections)) {
              extractFields(item.sections);
            }
          }
        });
      }
    };

    extractFields(structure);
    return signatureFields;
  }

  // Helper method to check if a specific field exists in form structure
  static hasFieldInStructure(structure, fieldName) {
    if (!structure || !fieldName) return false;
    
    const checkField = (items) => {
      if (Array.isArray(items)) {
        return items.some(item => {
          if (item && typeof item === 'object') {
            if (item.fieldName === fieldName || item.name === fieldName) return true;
            if (item.fields && checkField(item.fields)) return true;
            if (item.sections && checkField(item.sections)) return true;
          }
          return false;
        });
      }
      return false;
    };

    return checkField(structure);
  }

  // Generate signature data for PDF export
  static async getSignatureDataForPDF(submissionId, rtoId) {
    try {
      const submission = await FormSubmission.findOne({
        _id: submissionId,
        ...(rtoId && { rtoId })
      }).populate("formTemplateId");

      if (!submission) {
        throw new Error("Submission not found");
      }

      // Look for signatures with multiple possible combinations
      const signatures = await Signature.find({
        $or: [
          { submissionId: submissionId },
          { 
            formId: submission.formTemplateId._id,
            submissionId: submissionId 
          },
          { 
            formId: submission.formTemplateId._id,
            'metadata.submissionId': submissionId 
          }
        ],
        ...(rtoId && { rtoId })
      }).populate("userId", "firstName lastName email");

      logme.info("Found signatures for PDF export", {
        submissionId,
        formTemplateId: submission.formTemplateId._id,
        signatureCount: signatures.length,
        signatures: signatures.map(sig => ({
          fieldName: sig.fieldName,
          status: sig.status,
          hasData: !!sig.signatureData
        }))
      });

      // Extract all signature fields from the form structure to get the correct field names
      const formSignatureFields = this.extractSignatureFieldsFromStructure(submission.formTemplateId.formStructure);
      logme.info("Form structure signature fields", {
        formSignatureFields: formSignatureFields.map(f => f.fieldName)
      });

      // Create a mapping from stored field names to actual field names
      const fieldNameMapping = {};
      formSignatureFields.forEach(formField => {
        // The stored field name might have a section prefix like "section0_field_123"
        // We need to find signatures that match the actual field name "field_123"
        const actualFieldName = formField.fieldName;
        
        // Find signatures that could match this field
        signatures.forEach(signature => {
          // Check if the stored field name contains the actual field name
          // or if they match exactly
          if (signature.fieldName === actualFieldName || 
              signature.fieldName.includes(actualFieldName) ||
              actualFieldName.includes(signature.fieldName)) {
            fieldNameMapping[actualFieldName] = signature.fieldName;
            logme.info("Field name mapping found", {
              actualFieldName,
              storedFieldName: signature.fieldName,
              isExactMatch: signature.fieldName === actualFieldName
            });
          }
        });
      });

      // Map signatures to form fields using the corrected field names
      const signatureData = {};
      signatures.forEach(signature => {
        if (signature.status === 'completed' && signature.signatureData) {
          // Find the actual field name from the mapping
          let actualFieldName = signature.fieldName;
          
          // If we have a mapping, use the actual field name from the form structure
          for (const [formFieldName, storedFieldName] of Object.entries(fieldNameMapping)) {
            if (storedFieldName === signature.fieldName) {
              actualFieldName = formFieldName;
              break;
            }
          }
          
          signatureData[actualFieldName] = {
            data: signature.signatureData,
            type: signature.signatureType,
            signedBy: signature.userId,
            signedAt: signature.signedAt,
            fieldLabel: signature.fieldLabel,
            // Store the original field name for form data lookup
            originalFieldName: signature.fieldName
          };
          
          logme.info("Signature mapped to field", {
            storedFieldName: signature.fieldName,
            actualFieldName,
            hasData: !!signature.signatureData
          });
        }
      });

      return {
        hasSignatures: signatures.length > 0,
        signatureData,
        allSignaturesCompleted: signatures.every(sig => sig.status === 'completed'),
        signatures: signatures.map(sig => ({
          fieldName: sig.fieldName,
          fieldLabel: sig.fieldLabel,
          status: sig.status,
          signedBy: sig.userId,
          signedAt: sig.signedAt,
          validation: sig.validateSignature()
        }))
      };
    } catch (error) {
      logme.error("Get signature data for PDF error:", error);
      throw error;
    }
  }

  // Create signature requests for all signature fields in a form
  static async createSignatureRequestsForForm(formId, submissionId, userId, rtoId) {
    try {
      const form = await FormTemplate.findOne({
        _id: formId,
        ...(rtoId && { rtoId })
      });

      if (!form) {
        throw new Error("Form not found");
      }

      const signatureFields = form.fields.filter(field => field.type === 'signature');
      const signatureRequests = [];

      for (const field of signatureFields) {
        try {
          const signature = new Signature({
            formId,
            submissionId,
            userId,
            userType: 'student', // Default for form submissions
            fieldName: field.name,
            fieldLabel: field.label,
            status: 'pending',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            rtoId,
          });

          await signature.save();
          signatureRequests.push(signature);
        } catch (error) {
          logme.error(`Error creating signature request for field ${field.name}:`, error);
        }
      }

      return signatureRequests;
    } catch (error) {
      logme.error("Create signature requests for form error:", error);
      throw error;
    }
  }

  // Verify signature integrity
  static async verifySignatureIntegrity(signatureId, rtoId) {
    try {
      const signature = await Signature.findOne({
        _id: signatureId,
        ...(rtoId && { rtoId })
      });

      if (!signature) {
        return { valid: false, reason: "Signature not found" };
      }

      // Basic integrity check
      const currentHash = signature.signatureData ? signature.signatureData.length.toString() : '';
      const storedHash = signature.verificationHash;

      if (currentHash !== storedHash) {
        return { valid: false, reason: "Signature data integrity check failed" };
      }

      // Additional validation
      const validation = signature.validateSignature();
      return validation;
    } catch (error) {
      logme.error("Verify signature integrity error:", error);
      return { valid: false, reason: "Verification error" };
    }
  }

  // Get signature audit trail
  static async getSignatureAuditTrail(signatureId, rtoId) {
    try {
      const signature = await Signature.findOne({
        _id: signatureId,
        ...(rtoId && { rtoId })
      }).populate("userId", "firstName lastName email");

      if (!signature) {
        throw new Error("Signature not found");
      }

      const auditTrail = {
        signatureId: signature._id,
        formId: signature.formId,
        submissionId: signature.submissionId,
        fieldName: signature.fieldName,
        fieldLabel: signature.fieldLabel,
        status: signature.status,
        userType: signature.userType,
        signedBy: signature.userId,
        signedAt: signature.signedAt,
        expiresAt: signature.expiresAt,
        ipAddress: signature.ipAddress,
        userAgent: signature.userAgent,
        signatureType: signature.signatureType,
        isVerified: signature.isVerified,
        verifiedAt: signature.verifiedAt,
        verificationHash: signature.verificationHash,
        createdAt: signature.createdAt,
        updatedAt: signature.updatedAt,
        validation: signature.validateSignature()
      };

      return auditTrail;
    } catch (error) {
      logme.error("Get signature audit trail error:", error);
      throw error;
    }
  }
}

module.exports = SignatureService; 