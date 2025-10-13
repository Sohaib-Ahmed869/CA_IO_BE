const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// Import models
const Certification = require("../models/certification");
const FormTemplate = require("../models/formTemplate");

async function verifyFormTemplatePopulation() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Get all certifications with populated form templates
    const certifications = await Certification.find({ isActive: true })
      .populate("formTemplateIds.formTemplateId", "name description stepNumber filledBy isActive");

    console.log(`📋 Found ${certifications.length} active certifications\n`);

    let totalFormTemplates = 0;
    let populatedCount = 0;
    let unpopulatedCount = 0;

    for (const certification of certifications) {
      console.log(`🔍 Certification: ${certification.name}`);
      console.log(`   Form templates count: ${certification.formTemplateIds.length}`);

      certification.formTemplateIds.forEach((ft, index) => {
        totalFormTemplates++;
        
        if (ft.formTemplateId && ft.formTemplateId._id) {
          populatedCount++;
          console.log(`     ✅ ${index + 1}. ${ft.formTemplateId.name} (Step: ${ft.stepNumber}, FilledBy: ${ft.filledBy})`);
        } else {
          unpopulatedCount++;
          console.log(`     ❌ ${index + 1}. [UNPOPULATED] Step: ${ft.stepNumber}, FilledBy: ${ft.filledBy}, FormTemplateId: ${ft.formTemplateId}`);
        }
      });
      console.log("");
    }

    console.log(`📊 Summary:`);
    console.log(`   - Total certifications: ${certifications.length}`);
    console.log(`   - Total form template entries: ${totalFormTemplates}`);
    console.log(`   - Populated: ${populatedCount}`);
    console.log(`   - Unpopulated: ${unpopulatedCount}`);
    console.log(`   - Population rate: ${totalFormTemplates > 0 ? Math.round((populatedCount / totalFormTemplates) * 100) : 0}%`);

    if (unpopulatedCount > 0) {
      console.log(`\n⚠️  Found ${unpopulatedCount} unpopulated form template references.`);
      console.log(`   This can cause errors in step calculation.`);
      console.log(`   Make sure to populate formTemplateIds when fetching certifications.`);
    } else {
      console.log(`\n✅ All form template references are properly populated!`);
    }

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run the script
verifyFormTemplatePopulation();



