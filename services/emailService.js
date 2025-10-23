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
    // Fallback: if auth failed (e.g., 535) try explicit OUTLOOK_APP_PASSWORD with Outlook STARTTLS
    const msg = String(error && (error.response || error.message || error.toString() || ''));
    const isAuthFail = /\b535\b|Authentication unsuccessful|Invalid login/i.test(msg);
    const appPassword = process.env.OUTLOOK_APP_PASSWORD;
    const user = process.env.OUTLOOK_USER || process.env.SMTP_USER;
    if (isAuthFail && appPassword) {
      try {
        const fallback = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp-mail.outlook.com',
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: false,
          auth: { user, pass: appPassword, method: 'LOGIN' },
          requireTLS: true,
          tls: { rejectUnauthorized: false, secureProtocol: 'TLSv1_2_method' }
        });
        fallback.verify((fbErr) => {
          if (fbErr) {
            console.log('❌ Outlook SMTP fallback (APP PASSWORD) failed:', fbErr.message);
          } else {
            console.log('✅ Outlook SMTP fallback (APP PASSWORD) successful');
            transporter = fallback;
          }
        });
      } catch (fb) {
        console.log('❌ Outlook SMTP fallback init error:', fb.message);
      }
    }
    if (OUTLOOK_BYPASS) {
      console.log('🔄 OUTLOOK BYPASS ENABLED - Emails will be logged instead of sent');
    }
  } else {
    console.log('✅ Outlook SMTP connection successful');
  }
});

const sendEmail = async (to, subject, html) => {
  const fromEmail = process.env.OUTLOOK_USER || process.env.SMTP_USER || process.env.GMAIL_USER;
  
  // Check if emails are enabled via environment flag
  const emailsEnabled = process.env.EMAILS === 'true';
  
  if (!emailsEnabled) {
    console.log('📧 EMAILS DISABLED - Email would be sent to:', to);
    console.log('   Subject:', subject);
    console.log('   Content preview:', html.substring(0, 200) + '...');
    return { messageId: 'disabled-' + Date.now(), disabled: true };
  }
  
  // Always bypass SMTP for now - just log emails
  console.log('📧 EMAIL BYPASS - Email logged instead of sent:');
  console.log('   To:', to);
  console.log('   From:', fromEmail);
  console.log('   Subject:', subject);
  console.log('   Content preview:', html.substring(0, 200) + '...');
  return { messageId: 'bypass-' + Date.now() };
};

module.exports = { sendEmail };
