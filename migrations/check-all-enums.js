// Check All Enum Values in Source Database
const mongoose = require('mongoose');

// Source database connection (EBC)
const SOURCE_MONGODB_URI = 'mongodb+srv://sohaibsipra869:nvidia940MX@cluster0.jm4lunv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkAllEnums() {
  let sourceConnection;
  
  try {
    console.log('🔍 Checking all enum values in source database...');
    
    // Connect to source database (EBC)
    sourceConnection = await mongoose.createConnection(SOURCE_MONGODB_URI);
    console.log('✅ Connected to source EBC database');
    
    // Wait for connection to be ready
    await sourceConnection.asPromise();
    console.log('✅ Connection ready');
    
    const sourceDb = sourceConnection.db;
    
    // Check form submissions status
    console.log('\n📝 Checking form submissions status values:');
    const formSubmissionsCollection = sourceDb.collection('formsubmissions');
    const formSubmissionStatuses = await formSubmissionsCollection.distinct('status');
    console.log(`  Status values: ${formSubmissionStatuses.join(', ')}`);
    
    // Check applications overallStatus
    console.log('\n📋 Checking applications overallStatus values:');
    const applicationsCollection = sourceDb.collection('applications');
    const applicationStatuses = await applicationsCollection.distinct('overallStatus');
    console.log(`  Overall status values: ${applicationStatuses.join(', ')}`);
    
    // Check applications contactStatus
    console.log('\n📋 Checking applications contactStatus values:');
    const contactStatuses = await applicationsCollection.distinct('contactStatus');
    console.log(`  Contact status values: ${contactStatuses.join(', ')}`);
    
    // Check applications leadStatus
    console.log('\n📋 Checking applications leadStatus values:');
    const leadStatuses = await applicationsCollection.distinct('leadStatus');
    console.log(`  Lead status values: ${leadStatuses.join(', ')}`);
    
    // Check payments status
    console.log('\n💰 Checking payments status values:');
    const paymentsCollection = sourceDb.collection('payments');
    const paymentStatuses = await paymentsCollection.distinct('status');
    console.log(`  Payment status values: ${paymentStatuses.join(', ')}`);
    
    // Check initial screening forms status
    console.log('\n📋 Checking initial screening forms status values:');
    const initialScreeningFormsCollection = sourceDb.collection('initialscreeningforms');
    const initialScreeningFormStatuses = await initialScreeningFormsCollection.distinct('status');
    console.log(`  Initial screening form status values: ${initialScreeningFormStatuses.join(', ')}`);
    
    // Check users userType
    console.log('\n👥 Checking users userType values:');
    const usersCollection = sourceDb.collection('users');
    const userTypes = await usersCollection.distinct('userType');
    console.log(`  User type values: ${userTypes.join(', ')}`);
    
    // Check users rtoRole
    console.log('\n👥 Checking users rtoRole values:');
    const rtoRoles = await usersCollection.distinct('rtoRole');
    console.log(`  RTO role values: ${rtoRoles.join(', ')}`);
    
    // Check form templates filledBy
    console.log('\n📝 Checking form templates filledBy values:');
    const formTemplatesCollection = sourceDb.collection('formtemplates');
    const filledByValues = await formTemplatesCollection.distinct('filledBy');
    console.log(`  Filled by values: ${filledByValues.join(', ')}`);
    
    // Check certifications category
    console.log('\n📚 Checking certifications category values:');
    const certificationsCollection = sourceDb.collection('certifications');
    const certificationCategories = await certificationsCollection.distinct('category');
    console.log(`  Certification category values: ${certificationCategories.join(', ')}`);
    
    console.log('\n✅ Enum check completed!');
    
  } catch (error) {
    console.error('❌ Enum check failed:', error);
  } finally {
    if (sourceConnection) {
      await sourceConnection.close();
      console.log('\n🔌 Closed source database connection');
    }
  }
}

// Run check
if (require.main === module) {
  checkAllEnums();
}

module.exports = checkAllEnums;



