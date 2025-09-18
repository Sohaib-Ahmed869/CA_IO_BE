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
const superAdminRoutes = require("./routes/superAdminRoutes");
const superAdminPortalRoutes = require("./routes/superAdminPortalRoutes");
const applicationExportRoutes = require("./routes/applicationExportRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
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
      "https://ebc45818.certified.io"
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

// Health check
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

// Handle malformed JSON bodies with a clear 400 response
app.use((err, req, res, next) => {
  if (err && err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, message: "Invalid JSON in request body" });
  }
  return next(err);
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
});
