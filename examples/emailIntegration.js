
const multiEmailService = require("../services/multiEmailService");
const emailService2 = require("../services/emailService2");

// Example 1: Send email using RTO-specific configuration
async function sendRTOEmail() {
  try {
    const rtoId = "your-rto-id";
    const to = "user@example.com";
    const subject = "Welcome to our platform";
    const content = "<h1>Welcome!</h1><p>Thank you for joining us.</p>";
    
    // This will use RTO's email config if available, otherwise fallback to system
    const result = await multiEmailService.sendBrandedEmail(
      rtoId,
      to,
      subject,
      content,
      {
        primaryColor: "#007bff",
        secondaryColor: "#6c757d",
        companyName: "Your RTO",
        fromName: "Your RTO Team"
      }
    );
    
    console.log("Email sent:", result);
    console.log("Using system email:", result.isSystem);
    
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

// Example 2: Send email using existing emailService2 (backward compatible)
async function sendEmailBackwardCompatible() {
  try {
    const rtoId = "your-rto-id";
    const to = "user@example.com";
    const subject = "Welcome to our platform";
    const content = "<h1>Welcome!</h1><p>Thank you for joining us.</p>";
    
    // This will automatically use RTO config if available, otherwise system
    const result = await emailService2.sendEmail(to, subject, content, rtoId);
    
    console.log("Email sent:", result);
    console.log("Using system email:", result.isSystem);
    
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

// Example 3: Check email configuration status
async function checkEmailConfigStatus() {
  try {
    const rtoId = "your-rto-id";
    const status = await multiEmailService.getEmailConfigStatus(rtoId);
    
    console.log("Email config status:", status);
    
    if (status.hasConfig) {
      console.log("RTO has email configuration");
      console.log("Status:", status.status);
      console.log("Provider:", status.emailProvider);
      console.log("Emails sent:", status.emailsSent);
    } else {
      console.log("No RTO email configuration found, using system email");
    }
    
  } catch (error) {
    console.error("Error checking email config:", error);
  }
}

// Example 4: Test RTO email configuration
async function testRTOEmailConfig() {
  try {
    const rtoId = "your-rto-id";
    
    const result = await multiEmailService.testRTOEmailConfig(rtoId);
    
    console.log("Email configuration test result:", result);
    
  } catch (error) {
    console.error("Error testing email config:", error);
  }
}

module.exports = {
  sendRTOEmail,
  sendEmailBackwardCompatible,
  checkEmailConfigStatus,
  testRTOEmailConfig,
}; 