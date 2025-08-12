// Migration script to migrate certifications and form templates to Edward Business College RTO
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import models
const Certification = require('../models/certification');
const FormTemplate = require('../models/formTemplate');
const RTO = require('../models/rto');

// Target RTO ID
const TARGET_RTO_ID = '689b1d7af2b74ec81c46bdee';

async function migrateToEdwardCollege() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Verify target RTO exists
    const targetRTO = await RTO.findById(TARGET_RTO_ID);
    if (!targetRTO) {
      throw new Error(`Target RTO with ID ${TARGET_RTO_ID} not found`);
    }
    console.log(`✅ Target RTO found: ${targetRTO.companyName}`);

    // Read migration files
    const certificationsPath = path.join(__dirname, 'test.certifications.json');
    const formTemplatesPath = path.join(__dirname, 'test.formtemplates.json');

    if (!fs.existsSync(certificationsPath) || !fs.existsSync(formTemplatesPath)) {
      throw new Error('Migration files not found');
    }

    const certificationsData = JSON.parse(fs.readFileSync(certificationsPath, 'utf8'));
    const formTemplatesData = JSON.parse(fs.readFileSync(formTemplatesPath, 'utf8'));

    // Helper function to convert BSON format to clean objects
    function cleanBSONData(data) {
      if (Array.isArray(data)) {
        return data.map(item => cleanBSONData(item));
      } else if (data && typeof data === 'object') {
        const cleaned = {};
        for (const [key, value] of Object.entries(data)) {
          if (key === '$oid') {
            return value; // Convert $oid to string
          } else if (key === '$date') {
            return new Date(value); // Convert $date to Date object
          } else if (Array.isArray(value)) {
            cleaned[key] = cleanBSONData(value);
          } else if (value && typeof value === 'object') {
            cleaned[key] = cleanBSONData(value);
          } else {
            cleaned[key] = value;
          }
        }
        return cleaned;
      }
      return data;
    }

    // Clean the data
    const cleanCertifications = cleanBSONData(certificationsData);
    const cleanFormTemplates = cleanBSONData(formTemplatesData);

    console.log(`📚 Found ${cleanCertifications.length} certifications to migrate`);
    console.log(`📝 Found ${cleanFormTemplates.length} form templates to migrate`);

    // Migrate certifications
    console.log('\n🔄 Migrating certifications...');
    const migratedCertifications = [];
    
    for (const certData of cleanCertifications) {
      try {
        // Check if certification already exists for this RTO
        const existingCert = await Certification.findOne({
          name: certData.name,
          rtoId: TARGET_RTO_ID
        });

        if (existingCert) {
          console.log(`⏭️  Certification "${certData.name}" already exists, skipping...`);
          continue;
        }

        // Create new certification
        const newCert = new Certification({
          name: certData.name,
          description: certData.description || certData.name,
          rtoId: TARGET_RTO_ID,
          isActive: true,
          createdBy: targetRTO.createdBy || targetRTO._id,
          ...certData // Include any other fields from the original data
        });

        // Remove fields that shouldn't be copied
        delete newCert._id;
        delete newCert.createdAt;
        delete newCert.updatedAt;
        delete newCert.__v;

        const savedCert = await newCert.save();
        migratedCertifications.push(savedCert);
        console.log(`✅ Created certification: ${certData.name}`);
      } catch (error) {
        console.error(`❌ Error creating certification "${certData.name}":`, error.message);
      }
    }

    console.log(`\n✅ Successfully migrated ${migratedCertifications.length} certifications`);

    // Migrate form templates
    console.log('\n🔄 Migrating form templates...');
    const migratedFormTemplates = [];
    
    for (const templateData of cleanFormTemplates) {
      try {
        // Check if form template already exists for this RTO
        const existingTemplate = await FormTemplate.findOne({
          name: templateData.name,
          rtoId: TARGET_RTO_ID
        });

        if (existingTemplate) {
          console.log(`⏭️  Form template "${templateData.name}" already exists, skipping...`);
          continue;
        }

        // Create new form template
        const newTemplate = new FormTemplate({
          name: templateData.name,
          description: templateData.description || templateData.name,
          rtoId: TARGET_RTO_ID,
          isActive: true,
          createdBy: targetRTO.createdBy || targetRTO._id,
          formStructure: templateData.formStructure || [],
          stepNumber: templateData.stepNumber || 1,
          ...templateData // Include any other fields from the original data
        });

        // Remove fields that shouldn't be copied
        delete newTemplate._id;
        delete newTemplate.createdAt;
        delete newTemplate.updatedAt;
        delete newTemplate.__v;

        const savedTemplate = await newTemplate.save();
        migratedFormTemplates.push(savedTemplate);
        console.log(`✅ Created form template: ${templateData.name}`);
      } catch (error) {
        console.error(`❌ Error creating form template "${templateData.name}":`, error.message);
      }
    }

    console.log(`\n✅ Successfully migrated ${migratedFormTemplates.length} form templates`);

    // Summary
    console.log('\n🎉 Migration completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - RTO: ${targetRTO.companyName} (${targetRTO.subdomain})`);
    console.log(`   - Certifications migrated: ${migratedCertifications.length}`);
    console.log(`   - Form templates migrated: ${migratedFormTemplates.length}`);
    console.log(`   - Total items: ${migratedCertifications.length + migratedFormTemplates.length}`);

    // Show some examples of migrated items
    if (migratedCertifications.length > 0) {
      console.log('\n📚 Sample migrated certifications:');
      migratedCertifications.slice(0, 3).forEach(cert => {
        console.log(`   - ${cert.name}`);
      });
    }

    if (migratedFormTemplates.length > 0) {
      console.log('\n📝 Sample migrated form templates:');
      migratedFormTemplates.slice(0, 3).forEach(template => {
        console.log(`   - ${template.name}`);
      });
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run migration
if (require.main === module) {
  migrateToEdwardCollege();
}

module.exports = migrateToEdwardCollege;
