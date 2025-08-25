// Migration script to fix uniqueness constraints for soft delete support
const mongoose = require('mongoose');
require('dotenv').config();

async function fixUniquenessConstraints() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    
    console.log('\n🔄 Fixing uniqueness constraints for soft delete support...');

    // 1. Fix Certification model
    console.log('\n📚 Fixing Certification model...');
    try {
      // Drop existing unique index on name
      await db.collection('certifications').dropIndex('name_1');
      console.log('✅ Dropped old unique index on name');
    } catch (error) {
      console.log('ℹ️  No old unique index on name to drop');
    }

    // 2. Fix FormTemplate model
    console.log('\n📝 Fixing FormTemplate model...');
    try {
      // Drop existing unique index on name if it exists
      await db.collection('formtemplates').dropIndex('name_1');
      console.log('✅ Dropped old unique index on name');
    } catch (error) {
      console.log('ℹ️  No old unique index on name to drop');
    }

    // 3. Fix RTO model
    console.log('\n🏢 Fixing RTO model...');
    try {
      // Drop existing unique indexes
      await db.collection('rtos').dropIndex('subdomain_1');
      console.log('✅ Dropped old unique index on subdomain');
    } catch (error) {
      console.log('ℹ️  No old unique index on subdomain to drop');
    }

    try {
      await db.collection('rtos').dropIndex('rtoNumber_1');
      console.log('✅ Dropped old unique index on rtoNumber');
    } catch (error) {
      console.log('ℹ️  No old unique index on rtoNumber to drop');
    }

    // 4. Fix User model
    console.log('\n👤 Fixing User model...');
    try {
      // Drop existing compound unique index
      await db.collection('users').dropIndex('email_1_rtoId_1');
      console.log('✅ Dropped old compound unique index on email + rtoId');
    } catch (error) {
      console.log('ℹ️  No old compound unique index to drop');
    }

    console.log('\n✅ All old uniqueness constraints dropped successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Restart your application to apply new schema indexes');
    console.log('   2. New indexes will be created automatically with soft delete support');
    console.log('   3. Each RTO can now reuse names/emails after soft deletion');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run migration
if (require.main === module) {
  fixUniquenessConstraints();
}

module.exports = fixUniquenessConstraints;
