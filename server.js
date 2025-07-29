const express = require("express");
const cors = require("cors");
const connectDB = require("./config/database");
const logme = require("./utils/logger");

// Load environment variables
require("dotenv").config();

// Import subdomain middleware
const { getRTOFromSubdomain } = require("./middleware/subdomainMiddleware");

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
const superAdminRoutes = require("./routes/superAdminRoutes");
const superAdminPortalRoutes = require("./routes/superAdminPortalRoutes");
const rtoRoutes = require("./routes/rtoRoutes");
const app = express();

// Connect to database
connectDB();

const webhookRoutes = require("./routes/webhookRoutes");
app.use("/api/webhooks", webhookRoutes);

// Middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Allow localhost and all subdomains for development
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      
      // Allow production domains
      const allowedOrigins = [
        process.env.FRONTEND_URL,
        "http://localhost:5173",
        "https://certified.io",
        "https://ca-io-fe.vercel.app",
        "https://atr45282.certified.io"
      ];
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      logme.warn('CORS blocked origin', { origin });
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Subdomain', 'X-RTO-Subdomain']
  })
);
app.use(express.json({ limit: "900mb" }));
app.use(express.urlencoded({ extended: true }));

// Apply subdomain middleware to all routes
app.use(getRTOFromSubdomain);

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
app.use("/api/form-export", formExportRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/super-admin-portal", superAdminPortalRoutes);
app.use("/api/rtos", rtoRoutes);



// Health check
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

// Debug endpoint to test subdomain detection
app.get("/api/debug/rto-context", (req, res) => {
  res.json({
    success: true,
    data: {
      hostname: req.hostname,
      subdomain: req.hostname.split('.')[0],
      rtoContext: req.rtoContext,
      rtoId: req.rtoId,
      rto: req.rto ? {
        _id: req.rto._id,
        subdomain: req.rto.subdomain,
        companyName: req.rto.companyName,
        isActive: req.rto.isActive
      } : null
    }
  });
});

// Debug endpoint to test authentication
app.get("/api/debug/auth", authenticate, (req, res) => {
  res.json({
    success: true,
    data: {
      user: {
        id: req.user._id,
        email: req.user.email,
        userType: req.user.userType,
        isActive: req.user.isActive,
        rtoId: req.user.rtoId
      },
      rtoContext: req.rtoContext,
      rtoId: req.rtoId
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logme.error('Global error handler', err);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logme.info(`Server running on port ${PORT}`);
  logme.info('Dynamic RTO Subdomain System Active');
});
