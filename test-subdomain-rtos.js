// test-subdomain-rtos.js
const mongoose = require('mongoose');
const RTO = require('./models/rto');
const User = require('./models/user');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function createTestRTOs() {
  try {
    console.log('Creating test RTOs with subdomains...');

    // First create a super admin user
    const superAdmin = await User.create({
      firstName: "Super",
      lastName: "Admin",
      email: "superadmin@test.com",
      password: "password123",
      userType: "super_admin",
      rtoId: null,
      phoneNumber: "1234567890",
      phoneCode: "+1",
      isActive: true
    });

    console.log('✅ Super admin created:', superAdmin._id);

    // Create ATR Training RTO
    const atrRTO = await RTO.create({
      companyName: "ATR Training Institute",
      ceoName: "John Smith",
      ceoCode: "ATR001",
      subdomain: "atrtraining",
      email: "admin@atrtraining.com",
      phone: "+1234567890",
      rtoNumber: "RTO12345",
      registrationDate: new Date("2024-01-01"),
      expiryDate: new Date("2025-01-01"),
      isActive: true,
      isVerified: true,
      createdBy: superAdmin._id,
      settings: {
        features: {
          assessors: true,
          salesAgents: false,
          certificates: true,
          formTemplates: true
        }
      }
    });

    // Create Skills Train RTO
    const skillsRTO = await RTO.create({
      companyName: "Skills Train Academy",
      ceoName: "Sarah Johnson",
      ceoCode: "SKL002",
      subdomain: "skillstrain",
      email: "admin@skillstrain.com",
      phone: "+1234567891",
      rtoNumber: "RTO67890",
      registrationDate: new Date("2024-02-01"),
      expiryDate: new Date("2025-02-01"),
      isActive: true,
      isVerified: true,
      createdBy: superAdmin._id,
      settings: {
        features: {
          assessors: true,
          salesAgents: true,
          certificates: true,
          formTemplates: true
        }
      }
    });

    // Create CertPro RTO
    const certProRTO = await RTO.create({
      companyName: "CertPro Solutions",
      ceoName: "Mike Wilson",
      ceoCode: "CRP003",
      subdomain: "certpro",
      email: "admin@certpro.com",
      phone: "+1234567892",
      rtoNumber: "RTO11111",
      registrationDate: new Date("2024-03-01"),
      expiryDate: new Date("2025-03-01"),
      isActive: true,
      isVerified: true,
      createdBy: superAdmin._id,
      settings: {
        features: {
          assessors: false,
          salesAgents: true,
          certificates: true,
          formTemplates: true
        }
      }
    });

    console.log('✅ Test RTOs created successfully!');
    console.log('\n📋 RTO Details:');
    console.log('1. ATR Training:', atrRTO.subdomain, '->', atrRTO.companyName);
    console.log('2. Skills Train:', skillsRTO.subdomain, '->', skillsRTO.companyName);
    console.log('3. CertPro:', certProRTO.subdomain, '->', certProRTO.companyName);

    // Create test users for each RTO
    await createTestUsers(atrRTO._id, 'ATR');
    await createTestUsers(skillsRTO._id, 'Skills');
    await createTestUsers(certProRTO._id, 'CertPro');

    console.log('\n👥 Test users created for each RTO!');
    console.log('\n🌐 Test URLs:');
    console.log(`- ATR Training: http://atrtraining.localhost:5000`);
    console.log(`- Skills Train: http://skillstrain.localhost:5000`);
    console.log(`- CertPro: http://certpro.localhost:5000`);

    console.log('\n🔑 Test Login Credentials:');
    console.log('Super Admin: superadmin@test.com / password123');
    console.log('ATR Admin: admin@atr.com / password123');
    console.log('Skills Admin: admin@skills.com / password123');
    console.log('CertPro Admin: admin@certpro.com / password123');

  } catch (error) {
    console.error('❌ Error creating test RTOs:', error);
  } finally {
    mongoose.connection.close();
  }
}

async function createTestUsers(rtoId, prefix) {
  const users = [
    {
      firstName: `${prefix}Admin`,
      lastName: 'User',
      email: `admin@${prefix.toLowerCase()}.com`,
      password: 'password123',
      userType: 'admin',
      rtoId: rtoId,
      rtoRole: 'admin',
      phoneNumber: '1234567890',
      phoneCode: '+1',
      isActive: true
    },
    {
      firstName: `${prefix}Assessor`,
      lastName: 'User',
      email: `assessor@${prefix.toLowerCase()}.com`,
      password: 'password123',
      userType: 'assessor',
      rtoId: rtoId,
      rtoRole: 'assessor',
      phoneNumber: '1234567891',
      phoneCode: '+1',
      isActive: true
    },
    {
      firstName: `${prefix}Student`,
      lastName: 'User',
      email: `student@${prefix.toLowerCase()}.com`,
      password: 'password123',
      userType: 'user',
      rtoId: rtoId,
      rtoRole: 'user',
      phoneNumber: '1234567892',
      phoneCode: '+1',
      isActive: true
    }
  ];

  for (const userData of users) {
    await User.create(userData);
  }
}

// Run the script
createTestRTOs(); 