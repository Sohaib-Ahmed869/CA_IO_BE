// scripts/generateComplianceReport.js
require('dotenv').config({ override: true });
const connectDB = require("../config/database");
const User = require("../models/user");
const Application = require("../models/application");
const Payment = require("../models/payment");
const Certification = require("../models/certification");
const Certificate = require("../models/certificate");
const fs = require('fs');

// Student data to search for
const studentsToFind = [
  { firstName: "Patrick", lastName: "Ryan", qualification: "Certificate III in Plumbing", status: "Certificate Issued", date: "12/08" },
  { firstName: "Andrew", lastName: "Murray", qualification: "Certificate IV in Plumbing and Services (Operations)", status: "Completed - No Certificate", date: "20/08" },
  { firstName: "Basem", lastName: "Tissaoui", qualification: "Certificate IV in Plumbing and Services (Operations)", status: "Completed - No Certificate", date: "12/08" },
  { firstName: "James", lastName: "Eastmen", qualification: "Certificate IV in Plumbing and Services", status: "Completed - No Certificate", date: "15/08" },
  { firstName: "Kivork", lastName: "Bertikian", qualification: "Certificate III in Plumbing", status: "Completed - No Certificate", date: "15/08" }
];

const generateComplianceReport = async () => {
  try {
    await connectDB();
    console.log("🔍 Starting Compliance Report Generation...\n");
    
    const report = {
      reportTitle: "Student Certification Compliance Report",
      generatedAt: new Date().toISOString(),
      organizationInfo: {
        name: "Certified Australia",
        type: "RTO (Registered Training Organisation)",
        reportType: "Student Certification Audit"
      },
      executiveSummary: {
        totalStudentsReviewed: 0,
        certificatesIssued: 0,
        certificatesPending: 0,
        paymentsCompleted: 0,
        complianceIssues: []
      },
      detailedFindings: []
    };
    
    console.log("=" .repeat(80));
    console.log("📋 COMPLIANCE AUDIT REPORT");
    console.log("=" .repeat(80));
    
    for (const studentInfo of studentsToFind) {
      console.log(`\n🔎 Auditing: ${studentInfo.firstName} ${studentInfo.lastName}`);
      console.log(`📋 Expected Qualification: ${studentInfo.qualification}`);
      
      // Search for user
      const users = await User.find({
        firstName: { $regex: new RegExp(`^${studentInfo.firstName}$`, 'i') },
        lastName: { $regex: new RegExp(`^${studentInfo.lastName}$`, 'i') }
      }).lean();
      
      if (users.length === 0) {
        console.log("❌ Student not found in system");
        report.executiveSummary.complianceIssues.push({
          student: `${studentInfo.firstName} ${studentInfo.lastName}`,
          issue: "Student record not found in database",
          severity: "HIGH"
        });
        continue;
      }
      
      report.executiveSummary.totalStudentsReviewed++;
      
      for (const user of users) {
        console.log(`✅ Found: ${user.firstName} ${user.lastName}`);
        console.log(`🆔 User ID: ${user._id}`);
        console.log(`📧 Email: ${user.email}`);
        
        // Get applications
        const applications = await Application.find({ userId: user._id })
          .populate('certificationId', 'name description')
          .populate('certificateId')
          .lean();
        
        const studentReport = {
          studentInfo: {
            name: `${user.firstName} ${user.lastName}`,
            email: user.email,
            phoneCode: user.phoneCode,
            phoneNumber: user.phoneNumber,
            phone: user.phoneCode && user.phoneNumber ? `${user.phoneCode} ${user.phoneNumber}` : 'Not provided',
            userId: user._id,
            registrationDate: user.createdAt
          },
          applications: [],
          complianceStatus: "PENDING_REVIEW",
          issues: []
        };
        
        for (const application of applications) {
          console.log(`\n📋 Application: ${application._id}`);
          console.log(`🎓 Qualification: ${application.certificationId?.name || 'Unknown'}`);
          console.log(`📊 Status: ${application.overallStatus}`);
          
          // Get payment info
          const payment = await Payment.findOne({ 
            applicationId: application._id 
          }).lean();
          
          const paymentInfo = {
            status: payment?.status || 'NO_PAYMENT',
            amount: payment?.totalAmount || 0,
            type: payment?.paymentType || 'N/A',
            completedAt: payment?.completedAt || null
          };
          
          console.log(`💳 Payment: ${paymentInfo.status} - $${paymentInfo.amount}`);
          
          // Check certificate
          let certificateInfo = {
            issued: false,
            certificateNumber: null,
            issueDate: null,
            url: null,
            grade: null
          };
          
          if (application.certificateId) {
            const certificate = await Certificate.findById(application.certificateId).lean();
            if (certificate) {
              certificateInfo = {
                issued: true,
                certificateNumber: certificate.certificateNumber,
                issueDate: certificate.uploadedAt,
                url: certificate.s3Key,
                grade: certificate.grade
              };
              console.log(`🏆 Certificate: ${certificateInfo.certificateNumber} - ${certificateInfo.issueDate}`);
              report.executiveSummary.certificatesIssued++;
            }
          } else {
            console.log("🏆 No certificate issued");
            report.executiveSummary.certificatesPending++;
          }
          
          // Compliance check
          const complianceIssues = [];
          
          if (application.overallStatus === 'completed' && !certificateInfo.issued) {
            complianceIssues.push({
              type: "CERTIFICATE_NOT_ISSUED",
              description: "Application completed but certificate not issued",
              severity: "HIGH",
              recommendation: "Issue certificate immediately"
            });
          }
          
          if (paymentInfo.status !== 'completed' && application.overallStatus !== 'payment_pending') {
            complianceIssues.push({
              type: "PAYMENT_NOT_COMPLETED",
              description: "Payment not completed for active application",
              severity: "MEDIUM",
              recommendation: "Follow up on payment status"
            });
          }
          
          if (paymentInfo.status === 'completed') {
            report.executiveSummary.paymentsCompleted++;
          }
          
          const applicationReport = {
            applicationId: application._id,
            qualification: application.certificationId?.name || 'Unknown',
            status: application.overallStatus,
            createdAt: application.createdAt,
            completedAt: application.completedAt,
            payment: paymentInfo,
            certificate: certificateInfo,
            complianceIssues: complianceIssues
          };
          
          studentReport.applications.push(applicationReport);
          studentReport.issues.push(...complianceIssues);
        }
        
        // Overall compliance status
        if (studentReport.issues.length === 0) {
          studentReport.complianceStatus = "COMPLIANT";
        } else if (studentReport.issues.some(issue => issue.severity === 'HIGH')) {
          studentReport.complianceStatus = "NON_COMPLIANT_HIGH";
        } else {
          studentReport.complianceStatus = "NON_COMPLIANT_MEDIUM";
        }
        
        report.detailedFindings.push(studentReport);
        report.executiveSummary.complianceIssues.push(...studentReport.issues);
      }
    }
    
    // Generate summary
    console.log("\n" + "=".repeat(80));
    console.log("📊 EXECUTIVE SUMMARY");
    console.log("=".repeat(80));
    console.log(`👥 Total Students Reviewed: ${report.executiveSummary.totalStudentsReviewed}`);
    console.log(`🏆 Certificates Issued: ${report.executiveSummary.certificatesIssued}`);
    console.log(`⏳ Certificates Pending: ${report.executiveSummary.certificatesPending}`);
    console.log(`💳 Payments Completed: ${report.executiveSummary.paymentsCompleted}`);
    console.log(`⚠️  Compliance Issues: ${report.executiveSummary.complianceIssues.length}`);
    
    // High priority issues
    const highPriorityIssues = report.executiveSummary.complianceIssues.filter(issue => issue.severity === 'HIGH');
    if (highPriorityIssues.length > 0) {
      console.log("\n🚨 HIGH PRIORITY ISSUES:");
      highPriorityIssues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue.student || 'Unknown'}: ${issue.issue}`);
      });
    }
    
    // Save detailed report
    const reportFileName = `compliance-report-${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(reportFileName, JSON.stringify(report, null, 2));
    console.log(`\n💾 Detailed compliance report saved to: ${reportFileName}`);
    
    // Generate CSV summary
    const csvData = [
      ['Student Name', 'Email', 'Qualification', 'Status', 'Payment Status', 'Certificate Issued', 'Certificate Number', 'Compliance Status']
    ];
    
    report.detailedFindings.forEach(student => {
      student.applications.forEach(app => {
        csvData.push([
          student.studentInfo.name,
          student.studentInfo.email,
          app.qualification,
          app.status,
          app.payment.status,
          app.certificate.issued ? 'Yes' : 'No',
          app.certificate.certificateNumber || 'N/A',
          student.complianceStatus
        ]);
      });
    });
    
    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const csvFileName = `compliance-summary-${new Date().toISOString().split('T')[0]}.csv`;
    fs.writeFileSync(csvFileName, csvContent);
    console.log(`📊 CSV summary saved to: ${csvFileName}`);
    
    console.log("\n" + "=".repeat(80));
    console.log("🎯 COMPLIANCE RECOMMENDATIONS");
    console.log("=".repeat(80));
    
    if (report.executiveSummary.certificatesPending > 0) {
      console.log("📋 IMMEDIATE ACTION REQUIRED:");
      console.log(`   • Issue ${report.executiveSummary.certificatesPending} pending certificates`);
      console.log("   • Update certificate tracking system");
      console.log("   • Notify students of certificate availability");
    }
    
    if (highPriorityIssues.length > 0) {
      console.log("\n🔧 CORRECTIVE ACTIONS NEEDED:");
      highPriorityIssues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue.recommendation}`);
      });
    }
    
    console.log("\n✅ Compliance audit completed successfully!");
    
  } catch (error) {
    console.error("❌ Error generating compliance report:", error);
  } finally {
    await require('mongoose').disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  }
};

// Run the script
if (require.main === module) {
  generateComplianceReport();
}

module.exports = { generateComplianceReport };
