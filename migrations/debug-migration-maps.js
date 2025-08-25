// Debug Migration Maps
const mongoose = require('mongoose');
require('dotenv').config();

// Target RTO ID in current database
const TARGET_RTO_ID = '689b1d7af2b74ec81c46bdee';

async function debugMigrationMaps() {
  let sourceConnection, targetConnection;
  
  try {
    console.log('🔍 Debugging migration maps...');
    
    // Connect to source database (EBC)
    sourceConnection = await mongoose.createConnection('mongodb+srv://sohaibsipra869:nvidia940MX@cluster0.jm4lunv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
    console.log('✅ Connected to source EBC database');
    
    // Connect to target database (current)
    targetConnection = await mongoose.createConnection(process.env.MONGODB_URI);
    console.log('✅ Connected to target database');
    
    // Wait for connections to be ready
    await sourceConnection.asPromise();
    await targetConnection.asPromise();
    console.log('✅ Connections ready');
    
    // Create models
    const SourceUser = sourceConnection.model('User', require('../models/user').schema);
    const SourceApplication = sourceConnection.model('Application', require('../models/application').schema);
    const SourceDocumentUpload = sourceConnection.model('DocumentUpload', require('../models/documentUpload').schema);
    
    const TargetUser = targetConnection.model('User', require('../models/user').schema);
    const TargetApplication = targetConnection.model('Application', require('../models/application').schema);
    
    // Check specific failing document uploads
    console.log('\n🔍 Checking specific failing document uploads:');
    
    const failingUploadIds = [
      '68929f7e84c406cdd34d6965',
      '6892b0e684c406cdd34d8827', 
      '6892b76984c406cdd34d9774',
      '6893113584c406cdd34dbbb2'
    ];
    
    for (const uploadId of failingUploadIds) {
      console.log(`\n--- Document Upload ${uploadId} ---`);
      
      // Get source document upload
      const sourceUpload = await SourceDocumentUpload.findById(uploadId);
      if (sourceUpload) {
        console.log(`Source upload found:`);
        console.log(`  - ApplicationId: ${sourceUpload.applicationId}`);
        console.log(`  - UserId: ${sourceUpload.userId}`);
        
        // Check if source application exists
        const sourceApp = await SourceApplication.findById(sourceUpload.applicationId);
        if (sourceApp) {
          console.log(`  ✅ Source application exists with userId: ${sourceApp.userId}`);
          
          // Check if source user exists
          const sourceUser = await SourceUser.findById(sourceApp.userId);
          if (sourceUser) {
            console.log(`  ✅ Source user exists with email: ${sourceUser.email}`);
            
            // Try to find matching user in target by email
            const targetUser = await TargetUser.findOne({ 
              email: sourceUser.email, 
              rtoId: TARGET_RTO_ID 
            });
            
            if (targetUser) {
              console.log(`  ✅ Target user found: ${targetUser._id}`);
              
              // Try to find matching application in target
              const targetApp = await TargetApplication.findOne({
                userId: targetUser._id,
                rtoId: TARGET_RTO_ID
              });
              
              if (targetApp) {
                console.log(`  ✅ Target application found: ${targetApp._id}`);
                console.log(`  ✅ MAPPING SHOULD WORK: ${sourceUpload._id} -> ${targetApp._id}`);
              } else {
                console.log(`  ❌ Target application NOT found for user ${targetUser._id}`);
              }
            } else {
              console.log(`  ❌ Target user NOT found for email ${sourceUser.email}`);
            }
          } else {
            console.log(`  ❌ Source user NOT found`);
          }
        } else {
          console.log(`  ❌ Source application NOT found`);
        }
      } else {
        console.log(`❌ Source document upload NOT found`);
      }
    }
    
    // Check migration map population
    console.log('\n🔍 Checking migration map population:');
    
    // Get all source users
    const sourceUsers = await SourceUser.find({});
    console.log(`Source users count: ${sourceUsers.length}`);
    
    // Check first few users
    for (let i = 0; i < Math.min(5, sourceUsers.length); i++) {
      const sourceUser = sourceUsers[i];
      const targetUser = await TargetUser.findOne({ 
        email: sourceUser.email, 
        rtoId: TARGET_RTO_ID 
      });
      
      if (targetUser) {
        console.log(`✅ ${sourceUser.email}: ${sourceUser._id} -> ${targetUser._id}`);
      } else {
        console.log(`❌ ${sourceUser.email}: ${sourceUser._id} -> NOT FOUND`);
      }
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    if (sourceConnection) {
      await sourceConnection.close();
      console.log('\n🔌 Closed source database connection');
    }
    if (targetConnection) {
      await targetConnection.close();
      console.log('🔌 Closed target database connection');
    }
  }
}

// Run debug
if (require.main === module) {
  debugMigrationMaps();
}

module.exports = debugMigrationMaps;



