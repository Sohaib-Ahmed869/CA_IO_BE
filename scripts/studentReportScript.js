// scripts/studentReportScript.js
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const User = require("../models/user");
const Application = require("../models/application");
const Payment = require("../models/payment");
const Certification = require("../models/certification");
const Certificate = require("../models/certificate");

// Student data to search for
const studentsToFind = [
  // Certificate Issued
  { firstName: "Patrick", lastName: "Ryan", qualification: "Certificate III in Plumbing", status: "Certificate Issued", date: "12/08" },
  
  // Students completed but certificate not issued
  { firstName: "Andrew", lastName: "Murray", qualification: "Certificate IV in Plumbing and Services (Operations)", status: "Completed - No Certificate", date: "20/08" },
  { firstName: "Basem", lastName: "Tissaoui", qualification: "Certificate IV in Plumbing and Services (Operations)", status: "Completed - No Certificate", date: "12/08" },
  { firstName: "James", lastName: "Eastmen", qualification: "Certificate IV in Plumbing and Services", status: "Completed - No Certificate", date: "15/08" },
  { firstName: "Kivork", lastName: "Bertikian", qualification: "Certificate III in Plumbing", status: "Completed - No Certificate", date: "15/08" }
];

const generateStudentReport = async () => {
  try {
    await connectDB();
    
    console.log("🔍 Starting Student Report Generation...\n");
    console.log("=" .repeat(80));
    
    const report = [];
    
    for (const studentInfo of studentsToFind) {
      console.log(`\n🔎 Searching for: ${studentInfo.firstName} ${studentInfo.lastName}`);
      console.log(`📋 Expected Qualification: ${studentInfo.qualification}`);
      console.log(`📅 Expected Date: ${studentInfo.date}`);
      console.log(`📊 Expected Status: ${studentInfo.status}`);
      console.log("-".repeat(60));
      
      // Search for user by first name and last name (case insensitive)
      const users = await User.find({
        firstName: { $regex: new RegExp(`^${studentInfo.firstName}$`, 'i') },
        lastName: { $regex: new RegExp(`^${studentInfo.lastName}$`, 'i') }
      }).lean();
      
      if (users.length === 0) {
        console.log("❌ User not found in database");
        report.push({
          searchInfo: studentInfo,
          found: false,
          error: "User not found"
        });
        continue;
      }
      
      // If multiple users found, process all of them
      for (const user of users) {
        console.log(`✅ Found User: ${user.firstName} ${user.lastName}`);
        console.log(`🆔 User ID: ${user._id}`);
        console.log(`📧 Email: ${user.email}`);
        console.log(`📱 Phone: ${user.phoneCode && user.phoneNumber ? `${user.phoneCode} ${user.phoneNumber}` : 'Not provided'}`);
        
        // Get all applications for this user
        const applications = await Application.find({ userId: user._id })
          .populate('certificationId', 'name description')
          .populate('certificateId')
          .lean();
        
        console.log(`📝 Applications found: ${applications.length}`);
        
        const userReport = {
          searchInfo: studentInfo,
          found: true,
          userInfo: {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phoneCode: user.phoneCode,
            phoneNumber: user.phoneNumber,
            phone: user.phoneCode && user.phoneNumber ? `${user.phoneCode} ${user.phoneNumber}` : 'Not provided',
            createdAt: user.createdAt
          },
          applications: []
        };
        
        for (const application of applications) {
          console.log(`\n📋 Application ID: ${application._id}`);
          console.log(`🎓 Qualification: ${application.certificationId?.name || 'Unknown'}`);
          console.log(`📊 Overall Status: ${application.overallStatus}`);
          console.log(`📅 Created: ${application.createdAt}`);
          console.log(`✅ Completed: ${application.completedAt || 'Not completed'}`);
          
          // Get payment information for this application
          const payment = await Payment.findOne({ 
            applicationId: application._id 
          }).lean();
          
          let paymentInfo = {
            found: false,
            status: 'No payment found',
            amount: 0,
            type: 'N/A'
          };
          
          if (payment) {
            console.log(`💳 Payment Status: ${payment.status}`);
            console.log(`💰 Payment Amount: $${payment.totalAmount}`);
            console.log(`📋 Payment Type: ${payment.paymentType}`);
            
            paymentInfo = {
              found: true,
              status: payment.status,
              amount: payment.totalAmount,
              type: payment.paymentType,
              createdAt: payment.createdAt,
              completedAt: payment.completedAt
            };
          } else {
            console.log("💳 No payment found for this application");
          }
          
          // Check if certificate exists
          let certificateInfo = {
            found: false,
            url: null,
            certificateNumber: null,
            issuedAt: null
          };
          
          if (application.certificateId) {
            const certificate = await Certificate.findById(application.certificateId).lean();
            if (certificate) {
              console.log(`🏆 Certificate Found: ${certificate.certificateNumber || 'No number'}`);
              console.log(`🔗 Certificate URL: ${certificate.s3Key ? `S3: ${certificate.s3Key}` : 'No URL'}`);
              console.log(`📅 Issued: ${certificate.uploadedAt || 'No date'}`);
              
              certificateInfo = {
                found: true,
                url: certificate.s3Key,
                certificateNumber: certificate.certificateNumber,
                issuedAt: certificate.uploadedAt,
                grade: certificate.grade
              };
            }
          } else {
            console.log("🏆 No certificate issued for this application");
          }
          
          const applicationReport = {
            _id: application._id,
            certification: {
              name: application.certificationId?.name || 'Unknown',
              description: application.certificationId?.description || 'No description'
            },
            status: application.overallStatus,
            createdAt: application.createdAt,
            completedAt: application.completedAt,
            payment: paymentInfo,
            certificate: certificateInfo
          };
          
          userReport.applications.push(applicationReport);
        }
        
        report.push(userReport);
      }
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("📊 FINAL REPORT SUMMARY");
    console.log("=".repeat(80));
    
    // Generate summary
    const summary = {
      totalStudentsSearched: studentsToFind.length,
      studentsFound: report.filter(r => r.found).length,
      studentsNotFound: report.filter(r => !r.found).length,
      totalApplications: report.reduce((sum, r) => sum + (r.applications?.length || 0), 0),
      completedApplications: report.reduce((sum, r) => 
        sum + (r.applications?.filter(app => app.status === 'completed').length || 0), 0),
      certificatesIssued: report.reduce((sum, r) => 
        sum + (r.applications?.filter(app => app.certificate.found).length || 0), 0),
      paymentsCompleted: report.reduce((sum, r) => 
        sum + (r.applications?.filter(app => app.payment.status === 'completed').length || 0), 0)
    };
    
    console.log(`📈 Students Searched: ${summary.totalStudentsSearched}`);
    console.log(`✅ Students Found: ${summary.studentsFound}`);
    console.log(`❌ Students Not Found: ${summary.studentsNotFound}`);
    console.log(`📝 Total Applications: ${summary.totalApplications}`);
    console.log(`✅ Completed Applications: ${summary.completedApplications}`);
    console.log(`🏆 Certificates Issued: ${summary.certificatesIssued}`);
    console.log(`💳 Payments Completed: ${summary.paymentsCompleted}`);
    
    // Save detailed report to file
    const fs = require('fs');
    const reportData = {
      generatedAt: new Date().toISOString(),
      summary: summary,
      detailedReport: report
    };
    
    fs.writeFileSync('./student-report.json', JSON.stringify(reportData, null, 2));
    console.log("\n💾 Detailed report saved to: student-report.json");
    
    console.log("\n" + "=".repeat(80));
    console.log("🎯 DETAILED FINDINGS");
    console.log("=".repeat(80));
    
    // Show detailed findings
    report.forEach((student, index) => {
      if (student.found) {
        console.log(`\n${index + 1}. ${student.userInfo.firstName} ${student.userInfo.lastName}`);
        console.log(`   📧 Email: ${student.userInfo.email}`);
        console.log(`   📱 Phone: ${student.userInfo.phone}`);
        
        student.applications.forEach((app, appIndex) => {
          console.log(`   📋 Application ${appIndex + 1}:`);
          console.log(`      🎓 Qualification: ${app.certification.name}`);
          console.log(`      📊 Status: ${app.status}`);
          console.log(`      💳 Payment: ${app.payment.status} ($${app.payment.amount})`);
          console.log(`      🏆 Certificate: ${app.certificate.found ? 'Issued' : 'Not issued'}`);
          if (app.certificate.found) {
            console.log(`         🔗 URL: ${app.certificate.url}`);
            console.log(`         📄 Number: ${app.certificate.certificateNumber}`);
          }
        });
      } else {
        console.log(`\n${index + 1}. ${student.searchInfo.firstName} ${student.searchInfo.lastName} - NOT FOUND`);
      }
    });
    
  } catch (error) {
    console.error("❌ Error generating report:", error);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  }
};

// Run the script
if (require.main === module) {
  generateStudentReport();
}

module.exports = { generateStudentReport };
