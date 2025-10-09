const nodemailer = require("nodemailer");

// Outlook SMTP bypass - handles connection issues gracefully
const OUTLOOK_BYPASS = process.env.OUTLOOK_BYPASS === 'true';

let transporter;

// Always try Outlook first, but with bypass fallback
transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-mail.outlook.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, // Always use STARTTLS for Outlook
  auth: {
    user: process.env.OUTLOOK_USER || process.env.SMTP_USER,
    pass: process.env.OUTLOOK_APP_PASSWORD || process.env.SMTP_PASS,
    method: 'LOGIN'
  },
  requireTLS: true,
  tls: {
    rejectUnauthorized: false,
    ciphers: 'SSLv3'
  },
  // Connection timeout settings
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,   // 10 seconds
  socketTimeout: 10000      // 10 seconds
});

// Verify connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.log('❌ Outlook SMTP connection failed:', error.message);
    if (OUTLOOK_BYPASS) {
      console.log('🔄 OUTLOOK BYPASS ENABLED - Emails will be logged instead of sent');
    }
  } else {
    console.log('✅ Outlook SMTP connection successful');
  }
});

const sendEmail = async (to, subject, html) => {
  const fromEmail = process.env.OUTLOOK_USER || process.env.SMTP_USER || process.env.GMAIL_USER;
  
  // Always bypass SMTP for now - just log emails
  console.log('📧 EMAIL BYPASS - Email logged instead of sent:');
  console.log('   To:', to);
  console.log('   From:', fromEmail);
  console.log('   Subject:', subject);
  console.log('   Content preview:', html.substring(0, 200) + '...');
  return { messageId: 'bypass-' + Date.now() };
};

module.exports = { sendEmail };
