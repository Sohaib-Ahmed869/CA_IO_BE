/**
 * Enrollment Form Detection Test Script
 * 
 * This script helps test enrollment form detection for COE emails
 * Run with: node scripts/testEnrollmentFormDetection.js
 */

require('dotenv').config({ override: true });
const mongoose = require('mongoose');
const FormTemplate = require('../models/formTemplate');
const Application = require('../models/application');
const Certification = require('../models/certification');
const User = require('../models/user');

async function testEnrollmentFormDetection() {
  console.log("🔍 Testing Enrollment Form Detection");
  console.log("===================================\n");

  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/calcite');
    console.log("✅ Connected to database\n");

    // Test 1: Check all form templates for enrollment patterns
    console.log("📋 Test 1: Available Form Templates");
    const allFormTemplates = await FormTemplate.find({ isActive: true });
    
    console.log(`Found ${allFormTemplates.length} active form templates:`);
    allFormTemplates.forEach((form, index) => {
      const isEnrollmentForm = form.name.toLowerCase().includes("enrolment form") ||
                              form.name.toLowerCase().includes("enrolment") ||
                              form.name.toLowerCase().includes("enrollment form") ||
                              form.name.toLowerCase().includes("enrollment");
      
      console.log(`  ${index + 1}. "${form.name}" ${isEnrollmentForm ? '✅ (ENROLLMENT)' : '❌ (Not enrollment)'}`);
    });

    // Test 2: Check certifications and their form templates
    console.log("\n📜 Test 2: Certifications and Their Form Templates");
    const certifications = await Certification.find({ isActive: true }).populate('formTemplateIds.formTemplateId');
    
    certifications.forEach((cert, index) => {
      console.log(`\n  ${index + 1}. "${cert.name}"`);
      if (cert.formTemplateIds && cert.formTemplateIds.length > 0) {
        cert.formTemplateIds.forEach((formTemplate, ftIndex) => {
          const formName = formTemplate.formTemplateId?.name || formTemplate.title || 'Unknown';
          const isEnrollmentForm = formName.toLowerCase().includes("enrolment form") ||
                                  formName.toLowerCase().includes("enrolment") ||
                                  formName.toLowerCase().includes("enrollment form") ||
                                  formName.toLowerCase().includes("enrollment");
          
          console.log(`     ${ftIndex + 1}. "${formName}" ${isEnrollmentForm ? '✅ (ENROLLMENT)' : '❌ (Not enrollment)'}`);
        });
      } else {
        console.log("     No form templates found");
      }
    });

    // Test 3: Check specific applications
    console.log("\n👥 Test 3: Recent Applications");
    const recentApplications = await Application.find({})
      .populate('certificationId', 'name formTemplateIds')
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(5);

    if (recentApplications.length > 0) {
      recentApplications.forEach((app, index) => {
        console.log(`\n  ${index + 1}. Application ${app.appCode || app._id}`);
        console.log(`     Student: ${app.userId?.firstName} ${app.userId?.lastName} (${app.userId?.email})`);
        console.log(`     Certification: ${app.certificationId?.name}`);
        
        if (app.certificationId?.formTemplateIds) {
          const enrollmentForms = app.certificationId.formTemplateIds.filter(ft => {
            const formName = ft.formTemplateId?.name || ft.title || '';
            return formName.toLowerCase().includes("enrolment form") ||
                   formName.toLowerCase().includes("enrolment") ||
                   formName.toLowerCase().includes("enrollment form") ||
                   formName.toLowerCase().includes("enrollment");
          });
          
          if (enrollmentForms.length > 0) {
            console.log(`     ✅ Enrollment forms found: ${enrollmentForms.map(ef => ef.formTemplateId?.name || ef.title).join(', ')}`);
          } else {
            console.log(`     ❌ No enrollment forms found`);
            console.log(`     Available forms: ${app.certificationId.formTemplateIds.map(ft => ft.formTemplateId?.name || ft.title).join(', ')}`);
          }
        }
      });
    } else {
      console.log("No applications found");
    }

    // Test 4: Test the enrollment form detection logic
    console.log("\n🧪 Test 4: Enrollment Form Detection Logic");
    const testFormNames = [
      "Student Enrolment Form",
      "Enrolment Form",
      "Enrollment Form", 
      "Enrolment",
      "Enrollment",
      "Carpentry Enrolment Form",
      "Certificate III Enrolment",
      "Assessment Form",
      "LLND Assessment Form"
    ];

    testFormNames.forEach(formName => {
      const isEnrollmentForm = formName.toLowerCase().includes("enrolment form") ||
                              formName.toLowerCase().includes("enrolment") ||
                              formName.toLowerCase().includes("enrollment form") ||
                              formName.toLowerCase().includes("enrollment");
      
      console.log(`  "${formName}" → ${isEnrollmentForm ? '✅ ENROLLMENT' : '❌ Not enrollment'}`);
    });

    console.log("\n✅ Enrollment form detection test completed!");
    console.log("\n💡 If you see enrollment forms marked as 'Not enrollment', you may need to:");
    console.log("   1. Update the form template names to include 'enrolment' or 'enrollment'");
    console.log("   2. Or modify the detection logic in the code");

  } catch (error) {
    console.error("❌ Test failed:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("\n✅ Disconnected from database");
  }
}

// Run the test
if (require.main === module) {
  testEnrollmentFormDetection().catch(console.error);
}

module.exports = { testEnrollmentFormDetection };
