const mongoose = require('mongoose');
const RTO = require('./models/rto');

// Connect to database
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-database-name');

async function testRTO() {
  try {
    console.log('Testing RTO creation...');
    
    // Test RTO data
    const testRTO = new RTO({
      companyName: 'Test RTO',
      ceoName: 'Test CEO',
      ceoCode: 'TEST001',
      subdomain: 'test-rto',
      email: 'test@rtotest.com',
      phone: '+1234567890',
      rtoNumber: 'RTO12345',
      registrationDate: new Date('2024-01-01'),
      expiryDate: new Date('2025-01-01'),
      createdBy: new mongoose.Types.ObjectId(), // Dummy ObjectId
    });

    console.log('RTO object before save:', testRTO);
    
    const savedRTO = await testRTO.save();
    console.log('RTO saved successfully:', savedRTO._id);
    
    // Test retrieval
    const retrievedRTO = await RTO.findById(savedRTO._id);
    console.log('Retrieved RTO:', retrievedRTO);
    
    // Test getAllRTOs
    const allRTOs = await RTO.find();
    console.log('All RTOs count:', allRTOs.length);
    
    // Clean up
    await RTO.findByIdAndDelete(savedRTO._id);
    console.log('Test RTO deleted');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testRTO(); 