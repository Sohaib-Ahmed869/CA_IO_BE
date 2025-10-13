const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// Import database connection and models
const connectDB = require("../config/database");
const FormTemplate = require("../models/formTemplate");

async function listFormTemplates() {
  try {
    // Connect to database using the server method
    await connectDB();

    // Get all form templates
    const formTemplates = await FormTemplate.find({}).sort({ createdAt: -1 });

    console.log(`📋 Found ${formTemplates.length} form templates:\n`);

    formTemplates.forEach((template, index) => {
      console.log(`${index + 1}. ID: ${template._id}`);
      console.log(`   Name: ${template.name}`);
      console.log(`   Description: ${template.description || 'N/A'}`);
      console.log(`   Step Number: ${template.stepNumber}`);
      console.log(`   Filled By: ${template.filledBy}`);
      console.log(`   Is Active: ${template.isActive}`);
      console.log(`   Created: ${template.createdAt}`);
      console.log('');
    });

    console.log(`✅ Script completed successfully!`);
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run the script
listFormTemplates();



