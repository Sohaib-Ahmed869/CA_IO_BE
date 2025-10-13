const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// Import database connection and models
const connectDB = require("../config/database");
const Certification = require("../models/certification");
const FormTemplate = require("../models/formTemplate");

// Form template to add
const FORM_TEMPLATE_ID = "689be0830ce8931c29d7709d";
const FILLED_BY = "user";

async function addFormTemplateToSpecificCertification() {
  try {
    // Connect to database using the server method
    const db = await connectDB();

    console.log(`📝 Adding form template ID: ${FORM_TEMPLATE_ID}`);
    console.log(`   - Filled By: ${FILLED_BY}`);

    // Target specific qualification for testing
    const TARGET_QUALIFICATION_ID = "6876bd65bdaf884ac084b59a";
    
    // Get the specific certification
    const certification = await Certification.findById(TARGET_QUALIFICATION_ID);
    if (!certification) {
      console.error(`❌ Certification with ID ${TARGET_QUALIFICATION_ID} not found!`);
      process.exit(1);
    }

    console.log(`\n📋 Found target certification: ${certification.name} (ID: ${TARGET_QUALIFICATION_ID})`);

    console.log(`\n🔍 Processing: ${certification.name}`);
    console.log(`   Current form templates count: ${certification.formTemplateIds.length}`);

    // Check if this form template already exists in this certification
    const existingFormTemplate = certification.formTemplateIds.find(
      ft => ft.formTemplateId && ft.formTemplateId.toString() === FORM_TEMPLATE_ID
    );

    if (existingFormTemplate) {
      console.log(`   ⏭️  Form template already exists, skipping`);
      console.log(`   📊 Summary: 0 updated, 1 skipped (already exists)`);
    } else {
      // Add the form template to this certification - matching the exact structure you showed
      const newFormTemplateEntry = {
        formTemplateId: new mongoose.Types.ObjectId(FORM_TEMPLATE_ID),
        filledBy: FILLED_BY
        // Note: No stepNumber or title needed as per your structure
      };

      certification.formTemplateIds.push(newFormTemplateEntry);

      // Save the certification
      await certification.save();
      
      console.log(`   ✅ Added form template ID "${FORM_TEMPLATE_ID}" to certification`);
      console.log(`   📊 Summary: 1 updated, 0 skipped`);
    }

    // Verify the updates by fetching the certification with population
    console.log(`\n🔍 Verification - Fetching the updated certification with populated form templates:`);
    const updatedCert = await Certification.findById(TARGET_QUALIFICATION_ID)
      .populate("formTemplateIds.formTemplateId", "name description stepNumber filledBy isActive");

    if (updatedCert) {
      console.log(`   Certification: ${updatedCert.name}`);
      console.log(`   Form templates in this certification:`);
      updatedCert.formTemplateIds.forEach((ft, index) => {
        if (ft.formTemplateId) {
          console.log(`     ✅ ${index + 1}. ${ft.formTemplateId.name} (Step: ${ft.stepNumber}, FilledBy: ${ft.filledBy})`);
        } else {
          console.log(`     ❌ ${index + 1}. [UNPOPULATED] Step: ${ft.stepNumber}, FilledBy: ${ft.filledBy}`);
        }
      });
    }

    console.log(`\n✅ Script completed successfully!`);
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run the script
addFormTemplateToSpecificCertification();
