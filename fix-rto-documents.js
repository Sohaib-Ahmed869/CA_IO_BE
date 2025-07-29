const mongoose = require('mongoose');
require('./models/rto');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-database-name');

async function fixRtoDocuments() {
  try {
    console.log('🔧 Fixing RTO documents...');
    
    const RTO = mongoose.model('RTO');
    const rtos = await RTO.find({});
    
    let fixedCount = 0;
    
    for (const rto of rtos) {
      let needsUpdate = false;
      
      // Check if assets.documents exists and is not an array
      if (rto.assets && rto.assets.documents && !Array.isArray(rto.assets.documents)) {
        console.log(`Fixing RTO ${rto._id}: assets.documents is not an array`);
        rto.assets.documents = [];
        needsUpdate = true;
      }
      
      // Check if assets.documents contains string values instead of objects
      if (rto.assets && Array.isArray(rto.assets.documents)) {
        const validDocuments = rto.assets.documents.filter(doc => {
          if (typeof doc === 'string') {
            console.log(`Removing string document from RTO ${rto._id}`);
            return false;
          }
          if (typeof doc === 'object' && doc !== null) {
            return true;
          }
          console.log(`Removing invalid document from RTO ${rto._id}`);
          return false;
        });
        
        if (validDocuments.length !== rto.assets.documents.length) {
          rto.assets.documents = validDocuments;
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        await rto.save();
        fixedCount++;
        console.log(`✅ Fixed RTO: ${rto._id}`);
      }
    }
    
    console.log(`✅ Fixed ${fixedCount} RTOs`);
    
  } catch (error) {
    console.error('❌ Error fixing RTO documents:', error);
  } finally {
    mongoose.connection.close();
  }
}

fixRtoDocuments(); 