// Check Migration Maps
const mongoose = require('mongoose');
require('dotenv').config();

// Target RTO ID in current database
const TARGET_RTO_ID = '689b1d7af2b74ec81c46bdee';

async function checkMigrationMaps() {
  let targetConnection;
  
  try {
    console.log('🔍 Checking migration maps...');
    
    // Connect to target database (current)
    targetConnection = await mongoose.createConnection(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      bufferCommands: false
    });
    console.log('✅ Connected to target database');
    
    // Wait for connection to be ready
    await targetConnection.asPromise();
    console.log('✅ Target connection ready');
    
    // Create models using the target connection
    const User = targetConnection.model('User', require('../models/user').schema);
    const Application = targetConnection.model('Application', require('../models/application').schema);
    const DocumentUpload = targetConnection.model('DocumentUpload', require('../models/documentUpload').schema);
    
    console.log('✅ Models created using target connection');
    
    // Check what we have in our database
    console.log('\n📊 Checking current database state:');
    
    const userCount = await User.countDocuments({ rtoId: TARGET_RTO_ID });
    console.log(`👥 Users in target RTO: ${userCount}`);
    
    const applicationCount = await Application.countDocuments({ rtoId: TARGET_RTO_ID });
    console.log(`📋 Applications in target RTO: ${applicationCount}`);
    
    const documentUploadCount = await DocumentUpload.countDocuments({ rtoId: TARGET_RTO_ID });
    console.log(`📁 Document uploads in target RTO: ${documentUploadCount}`);
    
    // Check specific document uploads that were failing
    console.log('\n🔍 Checking specific document uploads:');
    
    const failingUploadIds = [
      '68929f7e84c406cdd34d6965',
      '6892b0e684c406cdd34d8827', 
      '6892b76984c406cdd34d9774',
      '6893113584c406cdd34dbbb2'
    ];
    
    for (const uploadId of failingUploadIds) {
      const upload = await DocumentUpload.findById(uploadId);
      if (upload) {
        console.log(`\n📁 Document Upload ${uploadId}:`);
        console.log(`  - ApplicationId: ${upload.applicationId}`);
        console.log(`  - UserId: ${upload.userId}`);
        console.log(`  - Status: ${upload.status}`);
        
        // Check if the referenced application exists
        const app = await Application.findById(upload.applicationId);
        if (app) {
          console.log(`  ✅ Referenced application exists`);
        } else {
          console.log(`  ❌ Referenced application NOT found`);
        }
        
        // Check if the referenced user exists
        const user = await User.findById(upload.userId);
        if (user) {
          console.log(`  ✅ Referenced user exists`);
        } else {
          console.log(`  ❌ Referenced user NOT found`);
        }
      } else {
        console.log(`\n❌ Document Upload ${uploadId} not found in target database`);
      }
    }
    
    // Check what applications exist
    console.log('\n📋 Sample applications in target RTO:');
    const sampleApps = await Application.find({ rtoId: TARGET_RTO_ID }).limit(5);
    sampleApps.forEach((app, index) => {
      console.log(`  ${index + 1}. ID: ${app._id}, UserId: ${app.userId}, Status: ${app.overallStatus}`);
    });
    
    // Check what users exist
    console.log('\n👥 Sample users in target RTO:');
    const sampleUsers = await User.find({ rtoId: TARGET_RTO_ID }).limit(5);
    sampleUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ID: ${user._id}, Email: ${user.email}, Name: ${user.firstName} ${user.lastName}`);
    });
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  } finally {
    if (targetConnection) {
      await targetConnection.close();
      console.log('\n🔌 Closed target database connection');
    }
  }
}

// Run check
if (require.main === module) {
  checkMigrationMaps();
}

module.exports = checkMigrationMaps;



