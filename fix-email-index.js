const mongoose = require('mongoose');

// Connect to database
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-database-name');

async function fixEmailIndex() {
  try {
    console.log('🔧 Fixing email index issue...');
    
    // Get the database connection
    const db = mongoose.connection.db;
    
    // List all indexes on users collection
    const indexes = await db.collection('users').indexes();
    console.log('Current indexes:', indexes.map(idx => idx.name));
    
    // Drop the problematic email_1 index if it exists
    try {
      await db.collection('users').dropIndex('email_1');
      console.log('✅ Dropped email_1 index');
    } catch (error) {
      console.log('ℹ️ email_1 index not found or already dropped');
    }
    
    // Create the new compound index
    try {
      await db.collection('users').createIndex(
        { email: 1, rtoId: 1 }, 
        { unique: true, name: 'email_rtoId_unique' }
      );
      console.log('✅ Created email + rtoId compound index');
    } catch (error) {
      console.log('ℹ️ Compound index already exists or error:', error.message);
    }
    
    // Create other necessary indexes
    const indexPromises = [
      db.collection('users').createIndex({ rtoId: 1 }, { name: 'rtoId_index' }),
      db.collection('users').createIndex({ userType: 1 }, { name: 'userType_index' }),
      db.collection('users').createIndex({ isActive: 1 }, { name: 'isActive_index' })
    ];
    
    await Promise.allSettled(indexPromises);
    console.log('✅ Created all necessary indexes');
    
    // Verify the fix
    const finalIndexes = await db.collection('users').indexes();
    console.log('Final indexes:', finalIndexes.map(idx => ({ name: idx.name, key: idx.key })));
    
    console.log('✅ Email index fix completed!');
    
  } catch (error) {
    console.error('❌ Error fixing email index:', error);
  } finally {
    mongoose.connection.close();
  }
}

fixEmailIndex(); 