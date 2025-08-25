// Check Failing Document Uploads
const mongoose = require('mongoose');

// Source database connection (EBC)
const SOURCE_MONGODB_URI = 'mongodb+srv://sohaibsipra869:nvidia940MX@cluster0.jm4lunv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkFailingDocumentUploads() {
  let sourceConnection;
  
  try {
    console.log('🔍 Checking failing document uploads...');
    
    // Connect to source database (EBC)
    sourceConnection = await mongoose.createConnection(SOURCE_MONGODB_URI);
    console.log('✅ Connected to source EBC database');
    
    // Wait for connection to be ready
    await sourceConnection.asPromise();
    console.log('✅ Connection ready');
    
    const sourceDb = sourceConnection.db;
    
    // Check document uploads collection
    console.log('\n📁 Checking document uploads with missing fields:');
    const documentUploadsCollection = sourceDb.collection('documentuploads');
    const allDocuments = await documentUploadsCollection.find({}).toArray();
    
    console.log(`📊 Found ${allDocuments.length} total document uploads`);
    
    // Check for missing applicationId or userId
    const documentsWithMissingFields = allDocuments.filter(doc => 
      !doc.applicationId || !doc.userId
    );
    
    console.log(`❌ Found ${documentsWithMissingFields.length} documents with missing fields:`);
    
    documentsWithMissingFields.forEach((doc, index) => {
      console.log(`\n--- Document ${index + 1} (ID: ${doc._id}) ---`);
      console.log(`  applicationId: ${doc.applicationId ? '✅ Present' : '❌ Missing'}`);
      console.log(`  userId: ${doc.userId ? '✅ Present' : '❌ Missing'}`);
      console.log(`  Fields: ${Object.keys(doc).join(', ')}`);
      
      // Show all fields
      Object.entries(doc).forEach(([key, value]) => {
        if (key !== '_id' && key !== '__v') {
          console.log(`    ${key}: ${typeof value} (${JSON.stringify(value).substring(0, 100)})`);
        }
      });
    });
    
    // Check for valid documents
    const validDocuments = allDocuments.filter(doc => 
      doc.applicationId && doc.userId
    );
    
    console.log(`\n✅ Found ${validDocuments.length} documents with all required fields`);
    
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
  checkFailingDocumentUploads();
}

module.exports = checkFailingDocumentUploads;
