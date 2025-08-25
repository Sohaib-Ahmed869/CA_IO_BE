// Check Payment and Document Upload Structure
const mongoose = require('mongoose');

// Source database connection (EBC)
const SOURCE_MONGODB_URI = 'mongodb+srv://sohaibsipra869:nvidia940MX@cluster0.jm4lunv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkPaymentDocumentStructure() {
  let sourceConnection;
  
  try {
    console.log('🔍 Checking payment and document upload structure...');
    
    // Connect to source database (EBC)
    sourceConnection = await mongoose.createConnection(SOURCE_MONGODB_URI);
    console.log('✅ Connected to source EBC database');
    
    // Wait for connection to be ready
    await sourceConnection.asPromise();
    console.log('✅ Connection ready');
    
    const sourceDb = sourceConnection.db;
    
    // Check payments collection
    console.log('\n💰 Checking payments structure:');
    const paymentsCollection = sourceDb.collection('payments');
    const paymentCount = await paymentsCollection.countDocuments();
    console.log(`📊 Found ${paymentCount} payments`);
    
    if (paymentCount > 0) {
      const paymentSamples = await paymentsCollection.find({}).limit(3).toArray();
      
      paymentSamples.forEach((sample, index) => {
        console.log(`\n--- Payment Sample ${index + 1} ---`);
        console.log(`Fields: ${Object.keys(sample).join(', ')}`);
        
        // Show key fields
        Object.entries(sample).forEach(([key, value]) => {
          if (key !== '_id' && key !== '__v') {
            console.log(`  ${key}: ${typeof value} (${JSON.stringify(value).substring(0, 100)})`);
          }
        });
      });
    }
    
    // Check document uploads collection
    console.log('\n📁 Checking document uploads structure:');
    const documentUploadsCollection = sourceDb.collection('documentuploads');
    const documentCount = await documentUploadsCollection.countDocuments();
    console.log(`📊 Found ${documentCount} document uploads`);
    
    if (documentCount > 0) {
      const documentSamples = await documentUploadsCollection.find({}).limit(3).toArray();
      
      documentSamples.forEach((sample, index) => {
        console.log(`\n--- Document Upload Sample ${index + 1} ---`);
        console.log(`Fields: ${Object.keys(sample).join(', ')}`);
        
        // Show key fields
        Object.entries(sample).forEach(([key, value]) => {
          if (key !== '_id' && key !== '__v') {
            console.log(`  ${key}: ${typeof value} (${JSON.stringify(value).substring(0, 100)})`);
          }
        });
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
  checkPaymentDocumentStructure();
}

module.exports = checkPaymentDocumentStructure;



