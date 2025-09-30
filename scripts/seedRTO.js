const mongoose = require("mongoose");
const RTO = require("../models/rto");

// Sample RTO data for seeding
const sampleRTOs = [
  {
    name: "Australian Leading Institute of Technology",
    shortName: "ALIT",
    rtoCode: "ALIT",
    ceoName: "Emily",
    ceoEmail: "emily@alit.edu.au",
    primaryColor: "#1f4e79",
    secondaryColor: "#6b7280",
    logo: {
      url: "https://certified.io/images/alitlogo.png",
      alt: "ALIT Logo"
    },
    emailConfig: {
      provider: "smtp",
      fromEmail: "noreply@alit.edu.au",
      fromName: "Australian Leading Institute of Technology"
    },
    contact: {
      address: {
        street: "123 Education Street",
        city: "Sydney",
        state: "NSW",
        postcode: "2000",
        country: "Australia"
      },
      phone: "+61 2 1234 5678",
      website: "https://alit.edu.au",
      supportEmail: "support@alit.edu.au"
    },
    features: {
      userManagement: true,
      taskManagement: true,
      roleBasedAccess: true
    },
    status: "active",
    isDefault: true
  },
  {
    name: "Certified Australia Training",
    shortName: "CERT",
    rtoCode: "CERT",
    ceoName: "John Smith",
    ceoEmail: "john@certified.edu.au",
    primaryColor: "#059669",
    secondaryColor: "#6b7280",
    logo: {
      url: "https://certified.io/images/certified-australia-logo.png",
      alt: "Certified Australia Logo"
    },
    emailConfig: {
      provider: "smtp",
      fromEmail: "noreply@certified.edu.au",
      fromName: "Certified Australia Training"
    },
    contact: {
      address: {
        street: "456 Training Avenue",
        city: "Melbourne",
        state: "VIC",
        postcode: "3000",
        country: "Australia"
      },
      phone: "+61 3 9876 5432",
      website: "https://certified.edu.au",
      supportEmail: "support@certified.edu.au"
    },
    features: {
      userManagement: true,
      taskManagement: true,
      roleBasedAccess: true
    },
    status: "active",
    isDefault: false
  }
];

async function seedRTOs() {
  try {
    console.log("🌱 Starting RTO seeding...");
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/calcite");
    console.log("✅ Connected to MongoDB");
    
    // Clear existing RTOs (optional - remove if you want to keep existing data)
    // await RTO.deleteMany({});
    // console.log("🧹 Cleared existing RTOs");
    
    // Insert sample RTOs
    const createdRTOs = [];
    
    for (const rtoData of sampleRTOs) {
      // Check if RTO already exists
      const existingRTO = await RTO.findOne({ rtoCode: rtoData.rtoCode });
      
      if (existingRTO) {
        console.log(`⏭️  RTO ${rtoData.rtoCode} already exists, skipping...`);
        continue;
      }
      
      const rto = new RTO(rtoData);
      await rto.save();
      createdRTOs.push(rto);
      console.log(`✅ Created RTO: ${rto.name} (${rto.rtoCode})`);
    }
    
    if (createdRTOs.length === 0) {
      console.log("ℹ️  No new RTOs created - all already exist");
    } else {
      console.log(`🎉 Successfully created ${createdRTOs.length} RTOs`);
    }
    
    // Verify default RTO
    const defaultRTO = await RTO.getDefault();
    if (defaultRTO) {
      console.log(`🏆 Default RTO: ${defaultRTO.name} (${defaultRTO.rtoCode})`);
    } else {
      console.log("⚠️  No default RTO found!");
    }
    
  } catch (error) {
    console.error("❌ Error seeding RTOs:", error);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB");
  }
}

// Run if called directly
if (require.main === module) {
  seedRTOs();
}

module.exports = seedRTOs;
