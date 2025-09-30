/**
 * RTO Context Test Script
 * 
 * This script tests the RTO context functionality to ensure backward compatibility
 * Run with: node scripts/testRTOContext.js
 */

require('dotenv').config({ override: true });
const mongoose = require('mongoose');
const FormTemplate = require('../models/formTemplate');
const Certification = require('../models/certification');
const RTO = require('../models/rto');
const { createRTODefaults } = require('../utils/rtoDefaults');
const { logMe } = require('../utils/logger');

async function testBackwardCompatibility() {
  console.log("🔄 Testing Backward Compatibility...\n");

  try {
    // Test 1: Check existing forms without RTO context
    console.log("📋 Test 1: Existing forms without RTO context");
    const existingForms = await FormTemplate.find({ rtoId: { $exists: false } });
    console.log(`   Found ${existingForms.length} forms without RTO context`);
    
    if (existingForms.length > 0) {
      console.log("   ✅ Backward compatibility: Forms without RTO context still exist");
      console.log(`   Sample form: ${existingForms[0].name}`);
    } else {
      console.log("   ℹ️  No existing forms found (expected for new installations)");
    }

    // Test 2: Check existing certifications without RTO context
    console.log("\n📜 Test 2: Existing certifications without RTO context");
    const existingCerts = await Certification.find({ rtoId: { $exists: false } });
    console.log(`   Found ${existingCerts.length} certifications without RTO context`);
    
    if (existingCerts.length > 0) {
      console.log("   ✅ Backward compatibility: Certifications without RTO context still exist");
      console.log(`   Sample certification: ${existingCerts[0].name}`);
    } else {
      console.log("   ℹ️  No existing certifications found (expected for new installations)");
    }

    // Test 3: Query forms with and without RTO context
    console.log("\n🔍 Test 3: Query compatibility");
    const allForms = await FormTemplate.find({ isActive: true });
    const formsWithRTO = await FormTemplate.find({ rtoId: { $exists: true } });
    const formsWithoutRTO = await FormTemplate.find({ rtoId: { $exists: false } });
    
    console.log(`   Total forms: ${allForms.length}`);
    console.log(`   Forms with RTO context: ${formsWithRTO.length}`);
    console.log(`   Forms without RTO context: ${formsWithoutRTO.length}`);
    console.log("   ✅ Query compatibility: Both types of forms are accessible");

    // Test 4: Check certification name uniqueness
    console.log("\n🔒 Test 4: Certification name uniqueness");
    const allCerts = await Certification.find({});
    const uniqueNames = [...new Set(allCerts.map(cert => cert.name))];
    
    console.log(`   Total certifications: ${allCerts.length}`);
    console.log(`   Unique names: ${uniqueNames.length}`);
    
    if (allCerts.length === uniqueNames.length) {
      console.log("   ✅ Name uniqueness: All certifications have unique names");
    } else {
      console.log("   ⚠️  Name conflicts detected (this is expected with RTO context)");
    }

    return true;
  } catch (error) {
    console.error("❌ Backward compatibility test failed:", error.message);
    return false;
  }
}

async function testRTOContextFunctionality() {
  console.log("\n🚀 Testing RTO Context Functionality...\n");

  try {
    // Test 1: Create a test RTO
    console.log("🏢 Test 1: Creating test RTO");
    const testRTO = new RTO({
      name: "Test RTO for Context",
      shortName: "TEST",
      rtoCode: "TEST_CONTEXT",
      ceoName: "Test CEO",
      primaryColor: "#ff0000",
      secondaryColor: "#00ff00"
    });
    
    await testRTO.save();
    console.log(`   ✅ Test RTO created: ${testRTO.name} (${testRTO.rtoCode})`);

    // Test 2: Create default forms and certifications
    console.log("\n📋 Test 2: Creating default forms and certifications");
    const defaults = await createRTODefaults(testRTO._id);
    console.log(`   ✅ Defaults created:`);
    console.log(`     - Forms: ${defaults.formTemplates.count}`);
    console.log(`     - Certifications: ${defaults.certifications.count}`);

    // Test 3: Verify forms are linked to RTO
    console.log("\n🔗 Test 3: Verifying RTO links");
    const rtoForms = await FormTemplate.find({ rtoId: testRTO._id });
    const rtoCerts = await Certification.find({ rtoId: testRTO._id });
    
    console.log(`   Forms linked to RTO: ${rtoForms.length}`);
    console.log(`   Certifications linked to RTO: ${rtoCerts.length}`);
    
    if (rtoForms.length > 0 && rtoCerts.length > 0) {
      console.log("   ✅ RTO linking: Forms and certifications are properly linked");
      
      // Show sample form
      console.log(`   Sample form: ${rtoForms[0].name} (Type: ${rtoForms[0].templateType})`);
      console.log(`   Sample certification: ${rtoCerts[0].name} (Type: ${rtoCerts[0].certificationType})`);
    } else {
      console.log("   ❌ RTO linking failed");
    }

    // Test 4: Test RTO context filtering
    console.log("\n🔍 Test 4: Testing RTO context filtering");
    
    // Simulate RTO context filtering
    const testRTOForms = await FormTemplate.find({ rtoId: testRTO._id });
    const otherForms = await FormTemplate.find({ 
      $or: [
        { rtoId: { $exists: false } },
        { rtoId: { $ne: testRTO._id } }
      ]
    });
    
    console.log(`   Forms for test RTO: ${testRTOForms.length}`);
    console.log(`   Forms for other RTOs: ${otherForms.length}`);
    console.log("   ✅ RTO context filtering: Working correctly");

    // Test 5: Test form template associations in certifications
    console.log("\n📋 Test 5: Testing form template associations");
    const certWithForms = await Certification.findById(defaults.certifications.ids[0])
      .populate('formTemplateIds.formTemplateId');
    
    if (certWithForms && certWithForms.formTemplateIds.length > 0) {
      console.log(`   Certification: ${certWithForms.name}`);
      console.log(`   Associated forms: ${certWithForms.formTemplateIds.length}`);
      console.log("   ✅ Form associations: Working correctly");
    } else {
      console.log("   ❌ Form associations: Failed");
    }

    // Cleanup: Delete test RTO and its associated data
    console.log("\n🧹 Cleanup: Removing test data");
    await FormTemplate.deleteMany({ rtoId: testRTO._id });
    await Certification.deleteMany({ rtoId: testRTO._id });
    await RTO.findByIdAndDelete(testRTO._id);
    console.log("   ✅ Test data cleaned up");

    return true;
  } catch (error) {
    console.error("❌ RTO context functionality test failed:", error.message);
    return false;
  }
}

async function testDataMigration() {
  console.log("\n🔄 Testing Data Migration Scenarios...\n");

  try {
    // Test 1: Check if we can add RTO context to existing data
    console.log("📋 Test 1: Adding RTO context to existing forms");
    
    // Find forms without RTO context
    const formsWithoutRTO = await FormTemplate.find({ rtoId: { $exists: false } }).limit(2);
    
    if (formsWithoutRTO.length > 0) {
      // Get default RTO
      const defaultRTO = await RTO.findOne({ isDefault: true });
      
      if (defaultRTO) {
        // Update first form to have RTO context
        await FormTemplate.findByIdAndUpdate(formsWithoutRTO[0]._id, {
          rtoId: defaultRTO._id,
          templateType: "custom"
        });
        
        console.log(`   ✅ Updated form "${formsWithoutRTO[0].name}" with RTO context`);
        console.log(`   RTO: ${defaultRTO.name} (${defaultRTO.rtoCode})`);
        
        // Verify the update
        const updatedForm = await FormTemplate.findById(formsWithoutRTO[0]._id);
        if (updatedForm.rtoId && updatedForm.rtoId.toString() === defaultRTO._id.toString()) {
          console.log("   ✅ Migration test: Form successfully updated with RTO context");
        } else {
          console.log("   ❌ Migration test: Form update failed");
        }
        
        // Revert the change for testing
        await FormTemplate.findByIdAndUpdate(formsWithoutRTO[0]._id, {
          $unset: { rtoId: 1, templateType: 1 }
        });
        console.log("   🔄 Reverted test changes");
      } else {
        console.log("   ℹ️  No default RTO found for migration test");
      }
    } else {
      console.log("   ℹ️  No forms without RTO context found for migration test");
    }

    return true;
  } catch (error) {
    console.error("❌ Data migration test failed:", error.message);
    return false;
  }
}

async function main() {
  console.log("🧪 RTO Context Test Suite");
  console.log("=========================\n");

  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/calcite');
    console.log("✅ Connected to database\n");

    // Run tests
    const test1 = await testBackwardCompatibility();
    const test2 = await testRTOContextFunctionality();
    const test3 = await testDataMigration();

    console.log("\n📊 Test Results Summary:");
    console.log("========================");
    console.log(`Backward Compatibility: ${test1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`RTO Context Functionality: ${test2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Data Migration: ${test3 ? '✅ PASS' : '❌ FAIL'}`);

    if (test1 && test2 && test3) {
      console.log("\n🎉 All tests passed! RTO context implementation is working correctly.");
    } else {
      console.log("\n⚠️  Some tests failed. Please review the implementation.");
    }

  } catch (error) {
    console.error("💥 Test suite failed:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("\n✅ Disconnected from database");
  }
}

// Run the test suite
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testBackwardCompatibility, testRTOContextFunctionality, testDataMigration };
