// Quick check: verify Applications in fresh DB have paymentId/documentUploadId
const mongoose = require('mongoose');

const FRESH_DB_URI = 'mongodb+srv://sohaibsipra869:nvidia940MX@caio.pdygbyn.mongodb.net/?retryWrites=true&w=majority&appName=CAIO';
const TARGET_RTO_ID = process.argv[2];

if (!TARGET_RTO_ID) {
  console.error('Usage: node migrations/check-fresh-links.js <freshRtoId>');
  process.exit(1);
}

async function run() {
  let conn;
  try {
    conn = await mongoose.createConnection(FRESH_DB_URI);
    await conn.asPromise();

    const Application = conn.model('Application', require('../models/application').schema);
    const Payment = conn.model('Payment', require('../models/payment').schema);
    const DocumentUpload = conn.model('DocumentUpload', require('../models/documentUpload').schema);

    const totalApps = await Application.countDocuments({ rtoId: TARGET_RTO_ID });
    const appsWithPayment = await Application.countDocuments({ rtoId: TARGET_RTO_ID, paymentId: { $exists: true, $ne: null } });
    const appsWithDocs = await Application.countDocuments({ rtoId: TARGET_RTO_ID, documentUploadId: { $exists: true, $ne: null } });

    const totalPayments = await Payment.countDocuments({ rtoId: TARGET_RTO_ID });
    const totalDocUploads = await DocumentUpload.countDocuments({ rtoId: TARGET_RTO_ID });

    console.log('Fresh DB link check');
    console.log(`  Applications (rto=${TARGET_RTO_ID}): ${totalApps}`);
    console.log(`  Applications with paymentId: ${appsWithPayment}`);
    console.log(`  Applications with documentUploadId: ${appsWithDocs}`);
    console.log(`  Payments (rto): ${totalPayments}`);
    console.log(`  DocumentUploads (rto): ${totalDocUploads}`);

    // Show a few without docs
    const noDocApps = await Application.find({ rtoId: TARGET_RTO_ID, documentUploadId: { $in: [null, undefined] } }).select('_id userId certificationId').limit(5).lean();
    if (noDocApps.length) {
      console.log('  Sample applications missing documentUploadId:');
      noDocApps.forEach(a => console.log(`   - app=${a._id} user=${a.userId} cert=${a.certificationId}`));
    }
  } catch (e) {
    console.error('Check failed:', e);
    process.exit(1);
  } finally {
    if (conn) await conn.close();
  }
}

run();




