// scripts/fixRTOCeoCodeIndex.js
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/calcite';
  await mongoose.connect(mongoUri, { });

  const db = mongoose.connection.db;
  const collection = db.collection('rtos');

  console.log('Connected. Fixing ceoCode index on rtos...');

  try {
    const indexes = await collection.indexes();
    const ceoIdx = indexes.find(i => Array.isArray(i.key) ? false : i.key && i.key.ceoCode === 1);
    if (ceoIdx) {
      console.log('Dropping existing ceoCode index:', ceoIdx.name);
      await collection.dropIndex(ceoIdx.name);
    }
  } catch (e) {
    console.warn('No existing ceoCode index to drop or error:', e.message);
  }

  // Create sparse unique index so ceoCode is unique when present, but optional
  await collection.createIndex({ ceoCode: 1 }, { unique: true, sparse: true, name: 'ceoCode_1_sparse_unique' });

  console.log('Done. ceoCode is now optional and unique only when present.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
