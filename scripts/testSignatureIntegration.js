// scripts/testSignatureIntegration.js
const mongoose = require('mongoose');
const Signature = require('../models/signature');
const FormTemplate = require('../models/formTemplate');
const FormSubmission = require('../models/formSubmission');
const SignatureService = require('../services/signatureService');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/test', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function testSignatureIntegration() {
  try {
    console.log('Testing signature integration...\n');

    // Check if there are any signatures in the database
    const totalSignatures = await Signature.countDocuments();
    console.log(`Total signatures in database: ${totalSignatures}`);

    if (totalSignatures > 0) {
      const sampleSignature = await Signature.findOne().populate('userId', 'firstName lastName');
      console.log('Sample signature:', {
        id: sampleSignature._id,
        fieldName: sampleSignature.fieldName,
        fieldLabel: sampleSignature.fieldLabel,
        status: sampleSignature.status,
        signedBy: sampleSignature.userId ? `${sampleSignature.userId.firstName} ${sampleSignature.userId.lastName}` : 'Unknown',
        hasSignatureData: !!sampleSignature.signatureData
      });
    }

    // Check form templates for signature fields
    const formTemplates = await FormTemplate.find().limit(5);
    console.log(`\nChecking ${formTemplates.length} form templates for signature fields...`);

    for (const template of formTemplates) {
      console.log(`\nForm: ${template.name} (ID: ${template._id})`);
      
      if (template.formStructure) {
        // Check if it's an array
        if (Array.isArray(template.formStructure)) {
          console.log('  - Form structure is an array with', template.formStructure.length, 'items');
          
          // Look for signature fields
          const signatureFields = findSignatureFields(template.formStructure);
          if (signatureFields.length > 0) {
            console.log('  - Found signature fields:', signatureFields.map(f => ({ name: f.fieldName, label: f.label, type: f.type })));
          } else {
            console.log('  - No signature fields found');
          }
        } else {
          console.log('  - Form structure is not an array:', typeof template.formStructure);
        }
      } else {
        console.log('  - No form structure found');
      }
    }

    // Check form submissions
    const totalSubmissions = await FormSubmission.countDocuments();
    console.log(`\nTotal form submissions: ${totalSubmissions}`);

    if (totalSubmissions > 0) {
      const sampleSubmission = await FormSubmission.findOne().populate('formTemplateId');
      console.log('\nSample submission:', {
        id: sampleSubmission._id,
        formName: sampleSubmission.formTemplateId?.name,
        formId: sampleSubmission.formTemplateId?._id,
        hasFormData: !!sampleSubmission.formData,
        formDataKeys: sampleSubmission.formData ? Object.keys(sampleSubmission.formData) : []
      });

      // Test signature service
      try {
        const signatureInfo = await SignatureService.getSignatureDataForPDF(sampleSubmission._id, sampleSubmission.rtoId);
        console.log('\nSignature service test result:', {
          hasSignatures: signatureInfo.hasSignatures,
          signatureCount: Object.keys(signatureInfo.signatureData).length,
          signatureFields: Object.keys(signatureInfo.signatureData),
          allSignaturesCompleted: signatureInfo.allSignaturesCompleted
        });
      } catch (error) {
        console.log('\nSignature service test failed:', error.message);
      }
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

function findSignatureFields(structure, path = '') {
  const signatureFields = [];
  
  if (Array.isArray(structure)) {
    for (let i = 0; i < structure.length; i++) {
      const item = structure[i];
      if (item && typeof item === 'object') {
        if (item.type === 'signature') {
          signatureFields.push({
            fieldName: item.fieldName || item.name,
            label: item.label,
            type: item.type,
            path: `${path}[${i}]`
          });
        } else if (item.fields && Array.isArray(item.fields)) {
          signatureFields.push(...findSignatureFields(item.fields, `${path}[${i}].fields`));
        }
      }
    }
  }
  
  return signatureFields;
}

testSignatureIntegration();
