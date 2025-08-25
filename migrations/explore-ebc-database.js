// Explore EBC Database Structure
// This script helps understand the source database before migration
const mongoose = require('mongoose');

// Source database connection (EBC)
const SOURCE_MONGODB_URI = 'mongodb+srv://sohaibsipra869:nvidia940MX@cluster0.jm4lunv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function exploreEBCDatabase() {
  let sourceConnection;
  
  try {
    console.log('🔍 Exploring EBC database structure...');
    
    // Connect to source database (EBC)
    sourceConnection = await mongoose.createConnection(SOURCE_MONGODB_URI);
    console.log('✅ Connected to source EBC database');
    
    // Wait for connection to be ready
    await sourceConnection.asPromise();
    console.log('✅ Connection ready');
    
    const sourceDb = sourceConnection.db;
    
    // Get all collections
    const collections = await sourceDb.listCollections().toArray();
    console.log('\n📚 Available collections:');
    collections.forEach(col => {
      console.log(`   - ${col.name}`);
    });
    
    // Explore key collections
    const keyCollections = ['users', 'formtemplates', 'certifications', 'applications', 'formsubmissions', 'certificates', 'payments', 'tickets', 'rtos'];
    
    for (const collectionName of keyCollections) {
      try {
        const collection = sourceDb.collection(collectionName);
        const count = await collection.countDocuments();
        
        if (count > 0) {
          console.log(`\n📊 ${collectionName.toUpperCase()} collection:`);
          console.log(`   - Document count: ${count}`);
          
          // Get sample document to understand structure
          const sample = await collection.findOne({});
          if (sample) {
            console.log(`   - Sample fields: ${Object.keys(sample).join(', ')}`);
            
            // Show some key fields
            const keyFields = ['name', 'email', 'title', 'subject', 'status', 'createdAt', 'updatedAt'];
            keyFields.forEach(field => {
              if (sample[field] !== undefined) {
                console.log(`     - ${field}: ${typeof sample[field]} (${sample[field]})`);
              }
            });
          }
        }
      } catch (error) {
        console.log(`   - Collection ${collectionName}: Not accessible or doesn't exist`);
      }
    }
    
    // Check for any unique constraints or indexes
    console.log('\n🔍 Checking for unique constraints...');
    for (const collectionName of keyCollections) {
      try {
        const collection = sourceDb.collection(collectionName);
        const indexes = await collection.indexes();
        
        if (indexes.length > 1) { // More than just _id index
          console.log(`\n📋 ${collectionName} indexes:`);
          indexes.forEach(index => {
            if (index.name !== '_id_') {
              console.log(`   - ${index.name}: ${JSON.stringify(index.key)}`);
              if (index.unique) {
                console.log(`     - UNIQUE constraint`);
              }
            }
          });
        }
      } catch (error) {
        // Collection might not exist
      }
    }
    
    console.log('\n✅ Database exploration completed!');
    console.log('\n📋 Next steps:');
    console.log('   1. Review the collection structures above');
    console.log('   2. Run the complete migration script');
    console.log('   3. Verify data integrity after migration');
    
  } catch (error) {
    console.error('❌ Database exploration failed:', error);
    process.exit(1);
  } finally {
    if (sourceConnection) {
      await sourceConnection.close();
      console.log('\n🔌 Closed source database connection');
    }
  }
}

// Run exploration
if (require.main === module) {
  exploreEBCDatabase();
}

module.exports = exploreEBCDatabase;
