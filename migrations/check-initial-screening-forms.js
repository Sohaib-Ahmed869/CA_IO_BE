// Check Initial Screening Forms Structure
const mongoose = require('mongoose');

// Source database connection (EBC)
const SOURCE_MONGODB_URI = 'mongodb+srv://sohaibsipra869:nvidia940MX@cluster0.jm4lunv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkInitialScreeningForms() {
  let sourceConnection;
  
  try {
    console.log('🔍 Checking initial screening forms structure...');
    
    // Connect to source database (EBC)
    sourceConnection = await mongoose.createConnection(SOURCE_MONGODB_URI);
    console.log('✅ Connected to source EBC database');
    
    // Wait for connection to be ready
    await sourceConnection.asPromise();
    console.log('✅ Connection ready');
    
    const sourceDb = sourceConnection.db;
    
    // Check initial screening forms collection
    const initialScreeningFormsCollection = sourceDb.collection('initialscreeningforms');
    const count = await initialScreeningFormsCollection.countDocuments();
    console.log(`📊 Found ${count} initial screening forms`);
    
    if (count > 0) {
      // Get sample documents
      const samples = await initialScreeningFormsCollection.find({}).limit(3).toArray();
      
      console.log('\n📋 Sample initial screening form structure:');
      samples.forEach((sample, index) => {
        console.log(`\n--- Sample ${index + 1} ---`);
        console.log(`Fields: ${Object.keys(sample).join(', ')}`);
        
        // Show key fields
        Object.entries(sample).forEach(([key, value]) => {
          if (key !== '_id' && key !== '__v') {
            console.log(`  ${key}: ${typeof value} (${JSON.stringify(value).substring(0, 100)})`);
          }
        });
      });
      
      // Check for required fields
      console.log('\n🔍 Checking for required fields:');
      const requiredFields = ['hasFormalQualifications', 'currentState', 'workExperienceLocation', 'workExperienceYears', 'certificationId'];
      
      requiredFields.forEach(field => {
        const hasField = samples.some(sample => sample[field] !== undefined);
        console.log(`  ${field}: ${hasField ? '✅ Present' : '❌ Missing'}`);
      });
      
      // Check for enum values
      console.log('\n🔍 Checking for enum values:');
      const enumFields = ['status'];
      
      enumFields.forEach(field => {
        const values = [...new Set(samples.map(sample => sample[field]).filter(Boolean))];
        console.log(`  ${field}: ${values.join(', ')}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  } finally {
    if (sourceConnection) {
      await sourceConnection.close();
      console.log('\n🔌 Closed source database connection');
    }
  }
}

// Run check
if (require.main === module) {
  checkInitialScreeningForms();
}

module.exports = checkInitialScreeningForms;


