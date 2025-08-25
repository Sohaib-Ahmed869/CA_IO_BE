// Check Document Upload Issues
const mongoose = require('mongoose');

// Source database connection (EBC)
const SOURCE_MONGODB_URI = 'mongodb+srv://sohaibsipra869:nvidia940MX@cluster0.jm4lunv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkDocumentUploadIssues() {
  let sourceConnection;
  
  try {
    console.log('🔍 Checking document upload issues...');
    
    // Connect to source database (EBC)
    sourceConnection = await mongoose.createConnection(SOURCE_MONGODB_URI);
    console.log('✅ Connected to source EBC database');
    
    // Wait for connection to be ready
    await sourceConnection.asPromise();
    console.log('✅ Connection ready');
    
    const sourceDb = sourceConnection.db;
    
    // Check document uploads collection
    console.log('\n📁 Checking document uploads...');
    const documentUploadsCollection = sourceDb.collection('documentuploads');
    const count = await documentUploadsCollection.countDocuments();
    console.log(`📊 Found ${count} document uploads`);
    
    if (count > 0) {
      // Get all document uploads
      const allUploads = await documentUploadsCollection.find({}).toArray();
      
      console.log('\n🔍 Analyzing document upload data:');
      
      // Check for missing or invalid references
      const issues = [];
      
      allUploads.forEach((upload, index) => {
        const problems = [];
        
        if (!upload.applicationId) {
          problems.push('Missing applicationId');
        }
        
        if (!upload.userId) {
          problems.push('Missing userId');
        }
        
        if (problems.length > 0) {
          issues.push({
            id: upload._id,
            fileName: upload.fileName,
            problems: problems,
            data: upload
          });
        }
      });
      
      if (issues.length > 0) {
        console.log(`\n❌ Found ${issues.length} document uploads with issues:`);
        issues.forEach((issue, index) => {
          console.log(`\n--- Issue ${index + 1} ---`);
          console.log(`ID: ${issue.id}`);
          console.log(`FileName: ${issue.fileName}`);
          console.log(`Problems: ${issue.problems.join(', ')}`);
          console.log(`Full data:`, JSON.stringify(issue.data, null, 2));
        });
      } else {
        console.log('\n✅ All document uploads have valid references');
      }
      
      // Show sample of good data
      const goodUploads = allUploads.filter(upload => upload.applicationId && upload.userId);
      if (goodUploads.length > 0) {
        console.log(`\n✅ Sample of valid document uploads (${goodUploads.length} total):`);
        goodUploads.slice(0, 3).forEach((upload, index) => {
          console.log(`\n--- Valid Upload ${index + 1} ---`);
          console.log(`ID: ${upload._id}`);
          console.log(`FileName: ${upload.fileName}`);
          console.log(`ApplicationId: ${upload.applicationId}`);
          console.log(`UserId: ${upload.userId}`);
        });
      }
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
  checkDocumentUploadIssues();
}

module.exports = checkDocumentUploadIssues;
