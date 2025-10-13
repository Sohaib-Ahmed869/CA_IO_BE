// scripts/runStudentReport.js
require('dotenv').config({ override: true });
const { generateStudentReport } = require('./studentReportScript');

console.log("🚀 Starting Student Report Generation...");
console.log("📋 This will search for the following students:");
console.log("   • Patrick Ryan (Certificate III in Plumbing) - Certificate Issued");
console.log("   • Andrew Murray (Certificate IV in Plumbing and Services Operations) - Completed, No Certificate");
console.log("   • Basem Tissaoui (Certificate IV in Plumbing and Services Operations) - Completed, No Certificate");
console.log("   • James Eastmen (Certificate IV in Plumbing and Services) - Completed, No Certificate");
console.log("   • Kivork Bertikian (Certificate III in Plumbing) - Completed, No Certificate");
console.log("");

generateStudentReport()
  .then(() => {
    console.log("✅ Report generation completed!");
  })
  .catch((error) => {
    console.error("❌ Report generation failed:", error);
    process.exit(1);
  });
