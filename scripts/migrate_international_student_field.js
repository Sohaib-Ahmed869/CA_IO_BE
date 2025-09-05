// scripts/migrate_international_student_field.js
const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const InitialScreeningForm = require('../models/initialScreeningForm');
const User = require('../models/user');

const migrateInternationalStudentField = async () => {
  try {
    // Connect to database
    const MONGODB_URI = 'mongodb+srv://iftikharazka01:cLrqfK3LulF04pGG@cluster0.axupdq1.mongodb.net/alit?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to database');

    // Find all initial screening forms without international_student field
    const formsWithoutField = await InitialScreeningForm.find({
      international_student: { $exists: false }
    });

    console.log(`Found ${formsWithoutField.length} forms without international_student field`);

    let updatedCount = 0;

    for (const form of formsWithoutField) {
      try {
        // Get the user's current international_student status
        const user = await User.findById(form.userId);
        
        if (user) {
          // Update the form with the user's current international_student status
          await InitialScreeningForm.findByIdAndUpdate(form._id, {
            international_student: user.international_student || false
          });
          
          console.log(`Updated form ${form._id} with international_student: ${user.international_student || false}`);
          updatedCount++;
        } else {
          // If user not found, default to false
          await InitialScreeningForm.findByIdAndUpdate(form._id, {
            international_student: false
          });
          
          console.log(`Updated form ${form._id} with international_student: false (user not found)`);
          updatedCount++;
        }
      } catch (error) {
        console.error(`Error updating form ${form._id}:`, error.message);
      }
    }

    console.log(`Migration completed. Updated ${updatedCount} forms.`);

    // Verify the migration
    const remainingForms = await InitialScreeningForm.find({
      international_student: { $exists: false }
    });
    
    console.log(`Remaining forms without international_student field: ${remainingForms.length}`);

  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
};

// Run migration if called directly
if (require.main === module) {
  migrateInternationalStudentField();
}

module.exports = migrateInternationalStudentField;
