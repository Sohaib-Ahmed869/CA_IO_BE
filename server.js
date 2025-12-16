const express = require("express");
const cors = require("cors");
const connectDB = require("./config/database");

// Load environment variables
require("dotenv").config({ override: true });
// Import routes
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const certificationRoutes = require("./routes/certificationRoutes");
const formTemplateRoutes = require("./routes/formTemplateRoutes");
const formSubmissionRoutes = require("./routes/formSubmissionRoutes");
const assessmentRoutes = require("./routes/assessmentRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const adminApplicationRoutes = require("./routes/adminApplicationRoutes");
const taskRoutes = require("./routes/taskRoutes");
const adminStudentRoutes = require("./routes/adminStudentRoutes");
const documentUploadRoutes = require("./routes/documentUploadRoutes");
const assessorApplicationRoutes = require("./routes/assessorApplicationRoutes");
const adminPaymentRoutes = require("./routes/adminPaymentRoutes");
const studentPaymentRoutes = require("./routes/studentPaymentRoutes");
const forecastingRoutes = require("./routes/forecastingRoutes");
const assessorFormRoutes = require("./routes/assessorFormRoutes");
const adminDashboardRoutes = require("./routes/adminDashboardRoutes");
const assessorDashboardRoutes = require("./routes/assessorDashboardRoutes");
const adminCertificateRoutes = require("./routes/adminCertificateRoutes");
const thirdPartyFormRoutes = require("./routes/thirdPartyFormRoutes");
const formExportRoutes = require("./routes/formExportRoutes");
const studentExportRoutes = require("./routes/studentExportRoutes");
const applicationExportRoutes = require("./routes/applicationExportRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");
const superAdminPortalRoutes = require("./routes/superAdminPortalRoutes");
const studentNotificationRoutes = require("./routes/studentNotificationRoutes");
const enrolmentFormRoutes = require("./routes/enrolmentFormRoutes");
const initialScreeningRoutes = require("./routes/initialScreeningRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const userManagementRoutes = require("./routes/userManagementRoutes");
const surveyFormRoutes = require("./routes/surveyFormRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const financeDashboardRoutes = require("./routes/financeDashboardRoutes");
const nodemailer = require("nodemailer");
const app = express();

// Connect to database
connectDB();

const webhookRoutes = require("./routes/webhookRoutes");
app.use("/api/webhooks", webhookRoutes);

// Middleware
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL,
      "http://localhost:5173",
      "http://localhost:5174",
      "https://certified.io",
      "https://ca-io-fe.vercel.app",
      "https://ebc45818.certified.io",
      "https://alit-staging.certified.io",
      "https://alit-stage.certified.io",
      "https://demo.certified.io",
      "https://etraining-stage.certified.io",
      "https://etrainingbackend.certified.io",
      "https://aia45775.certified.io",
      "https://aia-stage.certified.io"
    ],
    credentials: true,
    
  })
);
app.use(express.json({ limit: "900mb" }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin/certificates", adminCertificateRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/certifications", certificationRoutes);
app.use("/api/form-templates", formTemplateRoutes);
app.use("/api/form-submissions", formSubmissionRoutes);

app.use("/api/assessments", assessmentRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/admin/applications", adminApplicationRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/admin/students", adminStudentRoutes);
app.use("/api/documents", documentUploadRoutes);
app.use("/api/assessor/applications", assessorApplicationRoutes);
app.use("/api/admin/payments", adminPaymentRoutes);
app.use("/api/student-payments", studentPaymentRoutes);
app.use("/api/forecasting", forecastingRoutes);
app.use("/api/assessor-forms", assessorFormRoutes);
app.use("/api/admin-dashboard", adminDashboardRoutes);
app.use("/api/assessor-dashboard", assessorDashboardRoutes);
app.use("/api/third-party-forms", thirdPartyFormRoutes);
app.use("/api/form-exports", formExportRoutes);
app.use("/api/student-exports", studentExportRoutes);
app.use("/api/application-exports", applicationExportRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/super-admin-portal", superAdminPortalRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/user-management", userManagementRoutes);
app.use("/api/survey-forms", surveyFormRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/finance-dashboard", financeDashboardRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // SMTP connectivity check on startup (uses env vars)
  (async () => {
    const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase();
    let host, port, secure, user, pass, method;
    if (provider === 'outlook' || provider === 'office365' || provider === 'microsoft') {
      host = process.env.SMTP_HOST || 'smtp-mail.outlook.com';
      port = Number(process.env.SMTP_PORT || 587);
      secure = typeof process.env.SMTP_SECURE === 'string' ? process.env.SMTP_SECURE.toLowerCase() === 'true' : false;
      user = process.env.OUTLOOK_USER || process.env.SMTP_USER;
      pass = process.env.OUTLOOK_APP_PASSWORD || process.env.OUTLOOK_PASSWORD || process.env.SMTP_PASS;
      method = process.env.SMTP_AUTH_METHOD || 'LOGIN';
      console.log('Outlook SMTP host:', host, 'port:', port, 'secure:', secure, 'user:', user, 'pass:', pass, 'method:', method);
    } else if (provider === 'gmail') {
      host = 'smtp.gmail.com';
      port = Number(process.env.SMTP_PORT || 465);
      secure = typeof process.env.SMTP_SECURE === 'string' ? process.env.SMTP_SECURE.toLowerCase() === 'true' : port === 465;
      user = process.env.GMAIL_USER || process.env.SMTP_USER;
      pass = process.env.GMAIL_APP_PASSWORD || process.env.GOOGLE_APP_PASSWORD || process.env.SMTP_PASS;
      method = process.env.SMTP_AUTH_METHOD || 'LOGIN';
    } else {
      host = process.env.SMTP_HOST || 'smtp.zoho.com';
      port = Number(process.env.SMTP_PORT || 587);
      secure = typeof process.env.SMTP_SECURE === 'string' ? process.env.SMTP_SECURE.toLowerCase() === 'true' : port === 465;
      user = process.env.SMTP_USER || process.env.ZOHO_USER;
      pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.ZOHO_APP_PASSWORD;
      method = process.env.SMTP_AUTH_METHOD || 'LOGIN';
    }

    // Normalize secure flag for common provider/port combos
    // Outlook/Office365 should NEVER use port 465 with SSL - always use 587 with STARTTLS
    if (provider === 'outlook' || provider === 'office365' || provider === 'microsoft') {
      if (port === 465) {
        console.warn('[SMTP] Outlook does not support port 465. Forcing port 587 with STARTTLS');
        port = 587;
        secure = false;
      } else if (port !== 465) {
        // Outlook typically requires STARTTLS on 587
        if (secure === true) {
          console.warn('[SMTP] For Outlook on port 587, forcing secure=false (STARTTLS) to avoid SSL wrong version error');
        }
        secure = false;
      }
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass, method },
      requireTLS: !secure,
      // Add timeout settings to prevent hanging connections
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,   // 10 seconds
      socketTimeout: 10000,     // 10 seconds
      // TLS options for Outlook
      ...((provider === 'outlook' || provider === 'office365' || provider === 'microsoft') && {
        tls: {
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2',
          ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA'
        }
      })
    });

    try {
      await transporter.verify();
      console.log('[SMTP] Verify OK', { provider, host, port, secure, user });
    } catch (e) {
      console.error('[SMTP] Verify FAILED', { provider, host, port, secure, user, error: e?.message });

      // Fallback: If Outlook login fails, retry with explicit OUTLOOK_APP_PASSWORD and Outlook STARTTLS settings
      const errorMessage = String(e && (e.response || e.message || e.toString() || ''));
      const isOutlook = provider === 'outlook' || provider === 'office365' || provider === 'microsoft';
      const looksLikeAuthFailure = /\b535\b|Authentication unsuccessful|Invalid login/i.test(errorMessage);
      const appPassword = process.env.OUTLOOK_APP_PASSWORD;

      if (isOutlook && looksLikeAuthFailure && appPassword) {
        try {
          const fallbackHost = process.env.SMTP_HOST || 'smtp-mail.outlook.com';
          const fallbackPort = Number(process.env.SMTP_PORT || 587);
          const fallbackSecure = false; // STARTTLS for Outlook on 587
          const fallbackMethod = process.env.SMTP_AUTH_METHOD || 'LOGIN';

          console.warn('[SMTP] Outlook auth failed. Retrying with OUTLOOK_APP_PASSWORD via STARTTLS...');

          const fallbackTransporter = nodemailer.createTransport({
            host: fallbackHost,
            port: fallbackPort,
            secure: fallbackSecure,
            auth: { user, pass: appPassword, method: fallbackMethod },
            requireTLS: true,
            // Add timeout settings
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000,
            tls: {
              rejectUnauthorized: false,
              minVersion: 'TLSv1.2',
              ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA'
            }
          });

          await fallbackTransporter.verify();
          console.log('[SMTP] Verify OK (fallback with OUTLOOK_APP_PASSWORD)', { provider, host: fallbackHost, port: fallbackPort, secure: fallbackSecure, user });
        } catch (fallbackErr) {
          console.error('[SMTP] Fallback verify FAILED with OUTLOOK_APP_PASSWORD', { error: fallbackErr?.message });
        }
      }
    }
  })();

  // IMAP connectivity check on startup
  (async () => {
    
    const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase();
    let imapConfig = {};
    
    if (provider === 'gmail') {
      imapConfig = {
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
        label: process.env.GMAIL_LABEL || 'INBOX',
      };
    } else if (provider === 'outlook' || provider === 'office365' || provider === 'microsoft') {
      imapConfig = {
        host: process.env.IMAP_HOST || 'outlook.office365.com',
        port: Number(process.env.IMAP_PORT || 993),
        secure: true,
        user: process.env.OUTLOOK_USER || process.env.IMAP_USER,
        pass: process.env.OUTLOOK_APP_PASSWORD, // ONLY use app password for Outlook IMAP
        label: process.env.IMAP_LABEL || 'INBOX',
      };
      
      // Try alternative Outlook IMAP servers if default fails
      if (process.env.OUTLOOK_IMAP_SERVER) {
        imapConfig.host = process.env.OUTLOOK_IMAP_SERVER;
        console.log('[IMAP] Using custom Outlook IMAP server:', imapConfig.host);
      }
    } else {
      imapConfig = {
        host: process.env.IMAP_HOST,
        port: Number(process.env.IMAP_PORT || 993),
        secure: process.env.IMAP_TLS !== 'false',
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASS || process.env.IMAP_PASSWORD || process.env.ZOHO_APP_PASSWORD,
        label: process.env.IMAP_LABEL || 'INBOX',
      };
    }

    // Check if IMAP is disabled
    if (process.env.IMAP_DISABLED === 'true') {
      console.log('⚠️  [IMAP] DISABLED by environment variable');
      return;
    }

    // Validate configuration
    if (!imapConfig.host || !imapConfig.port || !imapConfig.user || !imapConfig.pass) {
      console.log('❌ [IMAP] DISABLED: Missing required configuration');
      console.log('[IMAP] Required config:', {
        host: imapConfig.host || 'NOT_SET',
        port: imapConfig.port || 'NOT_SET',
        user: imapConfig.user || 'NOT_SET',
        pass: imapConfig.pass ? '***' : 'NOT_SET',
        label: imapConfig.label || 'INBOX'
      });
      console.log('[IMAP] Environment variables needed:');
      if (provider === 'outlook' || provider === 'office365' || provider === 'microsoft') {
        console.log('   - EMAIL_PROVIDER=outlook');
        console.log('   - OUTLOOK_USER=your-email@domain.com');
        console.log('   - OUTLOOK_APP_PASSWORD=your-app-password');
      } else if (provider === 'gmail') {
        console.log('   - EMAIL_PROVIDER=gmail');
        console.log('   - GMAIL_USER=your-email@gmail.com');
        console.log('   - GMAIL_APP_PASSWORD=your-app-password');
      } else {
        console.log('   - IMAP_HOST=your-imap-server.com');
        console.log('   - IMAP_PORT=993');
        console.log('   - IMAP_USER=your-email@domain.com');
        console.log('   - IMAP_PASS=your-password');
      }
      return;
    }

    // Check if imapflow is installed
    let ImapFlow;
    try {
      ImapFlow = require('imapflow').ImapFlow;
    } catch (e) {
      console.log('❌ [IMAP] DISABLED: imapflow package not installed');
      console.log('   Run: npm install imapflow');
      return;
    }

    console.log('✅ [IMAP] Configuration valid:', {
      provider: provider || 'custom',
      host: imapConfig.host,
      port: imapConfig.port,
      secure: imapConfig.secure,
      user: imapConfig.user,
      label: imapConfig.label
    });

    // First, test basic credential validation
    console.log('🔍 [IMAP] Testing basic credentials...');
    console.log('   Username:', imapConfig.user);
    console.log('   Password:', imapConfig.pass );
    console.log('   Password length:', imapConfig.pass ? imapConfig.pass.length : 'NOT_SET');
    
    // Test IMAP connection
    let client = null;
    try {
      console.log('🔌 [IMAP] Testing connection...');
      
      // Build TLS options for Outlook/Office 365
      const isOutlook = provider === 'outlook' || provider === 'office365' || provider === 'microsoft';
      const tlsOptions = isOutlook ? {
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
        rejectUnauthorized: true,
        ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA'
      } : {
        rejectUnauthorized: false
      };

      client = new ImapFlow({
        host: imapConfig.host,
        port: imapConfig.port,
        secure: imapConfig.secure,
        auth: { 
          user: imapConfig.user, 
          pass: imapConfig.pass
        },
        logger: false,
        socketTimeout: 15000,
        greetingTimeout: 10000,
        connectionTimeout: 10000,
        // Add explicit TLS options
        tls: tlsOptions
      });

      // Add error handler
      client.on('error', (err) => {
        console.error('❌ [IMAP] Connection error:', err.message);
      });

      // Test server connectivity first
      console.log('🔌 [IMAP] Testing server connectivity...');
      
      // Connect with timeout
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 15000)
        )
      ]);
      
      console.log('✅ [IMAP] Server connection successful');
      console.log('🔐 [IMAP] Testing authentication...');
      
      // Test mailbox access
      await client.mailboxOpen(imapConfig.label);
      console.log(`✅ [IMAP] Mailbox '${imapConfig.label}' opened successfully`);
      
      // Get message count
      const allUids = await client.search({});
      console.log(`✅ [IMAP] Found ${allUids.length} messages in mailbox`);
      
      await client.logout();
      console.log('✅ [IMAP] Connection test completed successfully');
      console.log('🎯 [IMAP] TPR Email Polling is READY');
      
    } catch (error) {
      console.error('❌ [IMAP] Connection test FAILED:', error.message);
      console.error('❌ [IMAP] Full error details:', error);
      
      // Specific error diagnosis
      if (error.authenticationFailed) {
        console.error('🔐 [IMAP] AUTHENTICATION FAILED - This means:');
        console.error('   1. TLS/SSL connection succeeded (good!)');
        console.error('   2. But credentials were rejected by server');
        console.error('   3. Possible causes:');
        console.error('      ❌ App password is incorrect or expired');
        console.error('      ❌ IMAP is disabled for this account');
        console.error('      ❌ Account has MFA/conditional access restrictions');
        console.error('      ❌ Work/school account with IT-imposed restrictions');
      }
      
      console.log('🔧 [IMAP] Troubleshooting steps:');
      console.log('   1. Verify App Password:');
      console.log('      - Go to https://account.microsoft.com/security');
      console.log('      - Security > Advanced security options > App passwords');
      console.log('      - Generate a NEW app password for "Mail"');
      console.log('      - Copy the 16-character password (no spaces)');
      console.log('   2. Enable IMAP in Outlook:');
      console.log('      - Go to https://outlook.office.com/mail/options/mail/accounts');
      console.log('      - POP and IMAP > Enable IMAP');
      console.log('   3. For work/school accounts (@et.edu.au):');
      console.log('      - Contact IT admin to enable IMAP access');
      console.log('      - Some organizations disable IMAP for security');
      console.log('      - May need to request IMAP access exception');
      
      if (provider === 'gmail') {
        console.log('   4. For Gmail: Use App Password, not regular password');
        console.log('      - Enable 2FA and generate App Password in Google Account');
      } else if (provider === 'outlook' || provider === 'office365' || provider === 'microsoft') {
        console.log('   4. Try alternative IMAP servers:');
        console.log('      * outlook.office365.com (current)');
        console.log('      * imap-mail.outlook.com');
        console.log('      * imap.outlook.com');
        console.log('   5. Try StartTLS (port 143) instead of SSL (port 993):');
        console.log('      - Set OUTLOOK_USE_STARTTLS=true in .env');
        console.log('      - This uses port 143 with StartTLS instead of port 993');
      }
      
      // Show current config for debugging
      console.log('🔍 [IMAP] Current configuration being used:');
      console.log('   Host:', imapConfig.host);
      console.log('   Port:', imapConfig.port);
      console.log('   Secure:', imapConfig.secure);
      console.log('   User:', imapConfig.user);
      console.log('   Pass:', imapConfig.pass ? '***SET***' : 'NOT_SET');
      console.log('   Label:', imapConfig.label);
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch (e) {
          // Ignore logout errors
        }
      }
    }
  })();
});
