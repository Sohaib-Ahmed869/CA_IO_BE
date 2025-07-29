const mongoose = require('mongoose');
require('./models/rto');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-database-name');

async function debugRtoDocuments() {
  try {
    console.log('🔍 Debugging RTO documents...');
    
    const RTO = mongoose.model('RTO');
    
    // Find the specific RTO that's causing issues
    const rtos = await RTO.find({});
    
    for (const rto of rtos) {
      console.log(`\nRTO ID: ${rto._id}`);
      console.log(`Company: ${rto.companyName}`);
      
      if (rto.assets) {
        console.log('Assets exists');
        if (rto.assets.documents) {
          console.log(`Documents type: ${typeof rto.assets.documents}`);
          console.log(`Is Array: ${Array.isArray(rto.assets.documents)}`);
          console.log(`Documents:`, JSON.stringify(rto.assets.documents, null, 2));
          
          // Fix if it's not an array or contains strings
          if (!Array.isArray(rto.assets.documents)) {
            console.log('❌ Documents is not an array - fixing...');
            rto.assets.documents = [];
            await rto.save();
            console.log('✅ Fixed: converted to empty array');
          } else {
            // Check if any documents are strings
            const hasStringDocs = rto.assets.documents.some(doc => typeof doc === 'string');
            if (hasStringDocs) {
              console.log('❌ Documents array contains strings - fixing...');
              rto.assets.documents = rto.assets.documents.filter(doc => typeof doc === 'object');
              await rto.save();
              console.log('✅ Fixed: removed string documents');
            }
          }
        } else {
          console.log('No documents array');
        }
      } else {
        console.log('No assets');
      }
    }
    
  } catch (error) {
    console.error('❌ Error debugging RTO documents:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugRtoDocuments(); 