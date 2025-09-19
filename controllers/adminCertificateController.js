// controllers/certificateController.js - CREATE THIS NEW FILE

const Application = require("../models/application");
const emailService = require("../services/emailService2");
const {
  upload,
  generatePresignedUrl,
  generateInlineSignedUrl,
  deleteFileFromS3,
  s3Client,
} = require("../config/s3Config");
const { GetObjectCommand } = require("@aws-sdk/client-s3");

const certificateController = {
  // Admin: Upload final certificate
  uploadFinalCertificate: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { expiryMonths = 12, grade, notes, certificateNumber } = req.body;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No certificate file uploaded",
        });
      }

      // Find application
      const application = await Application.findById(applicationId)
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name description");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Check if certificate already exists
      if (application.finalCertificate && application.finalCertificate.s3Key) {
        return res.status(409).json({
          success: false,
          message: "Certificate already uploaded for this application",
        });
      }

      // Generate certificate number if not provided
      const finalCertificateNumber =
        certificateNumber ||
        `CERT-${new Date().getFullYear()}-${String(
          Math.floor(Math.random() * 999999)
        ).padStart(6, "0")}`;

      // Calculate expiry date
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + parseInt(expiryMonths));

      // Update application with certificate info
      const updatedApplication = await Application.findByIdAndUpdate(
        applicationId,
        {
          finalCertificate: {
            s3Key: req.file.key,
            originalName: req.file.originalname,
            uploadedAt: new Date(),
            uploadedBy: req.user.id,
            certificateNumber: finalCertificateNumber,
            expiryDate: expiryDate,
            grade: grade || "",
            notes: notes || "",
          },
          overallStatus: "certificate_issued",
        },
        { new: true }
      )
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name description")
        .populate("finalCertificate.uploadedBy", "firstName lastName");

      // SEND EMAIL NOTIFICATION TO STUDENT
      try {
        const certificateDetails = {
          certificateId: finalCertificateNumber,
          certificationName: updatedApplication.certificationId.name,
          downloadUrl: await generatePresignedUrl(req.file.key, 3600),
          issueDate: new Date(),
          expiryDate: expiryDate,
          grade: grade,
          _id: updatedApplication._id,
        };

        await emailService.sendCertificateDownloadEmail(
          updatedApplication.userId,
          updatedApplication,
          certificateDetails
        );

        console.log(
          `Certificate notification email sent to ${updatedApplication.userId.email}`
        );
      } catch (emailError) {
        console.error("Error sending certificate email:", emailError);
        // Don't fail the main operation if email fails
      }

      res.status(201).json({
        success: true,
        message: "Certificate uploaded successfully and notification sent",
        data: {
          application: updatedApplication,
          certificateNumber: finalCertificateNumber,
          downloadUrl: await generatePresignedUrl(req.file.key, 3600),
        },
      });
    } catch (error) {
      console.error("Upload certificate error:", error);
      res.status(500).json({
        success: false,
        message: "Error uploading certificate",
      });
    }
  },

  // User: Get user's certificates
  getUserCertificates: async (req, res) => {
    try {
      const userId = req.user.id;

      const applications = await Application.find({
        userId: userId,
        "finalCertificate.s3Key": { $exists: true, $ne: null },
      })
        .populate("certificationId", "name description")
        .populate("finalCertificate.uploadedBy", "firstName lastName")
        .sort({ "finalCertificate.uploadedAt": -1 });

      // Generate download URLs for certificates
      const certificatesWithUrls = await Promise.all(
        applications.map(async (app) => {
          if (app.finalCertificate && app.finalCertificate.s3Key) {
            const downloadUrl = await generatePresignedUrl(
              app.finalCertificate.s3Key,
              3600
            );
            return {
              ...app.toObject(),
              downloadUrl,
              isExpired: app.finalCertificate.expiryDate
                ? new Date() > app.finalCertificate.expiryDate
                : false,
            };
          }
          return app.toObject();
        })
      );

      res.json({
        success: true,
        data: {
          certificates: certificatesWithUrls,
          totalCertificates: certificatesWithUrls.length,
        },
      });
    } catch (error) {
      console.error("Get user certificates error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching certificates",
      });
    }
  },

  // User: Download specific certificate
  downloadCertificate: async (req, res) => {
    try {
      console.log("Download certificate request:", req.params);
      const { applicationId } = req.params;
      const userId = req.user.id;

      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
        "finalCertificate.s3Key": { $exists: true, $ne: null },
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Certificate not found",
        });
      }

      if (
        !application.finalCertificate ||
        !application.finalCertificate.s3Key
      ) {
        return res.status(404).json({
          success: false,
          message: "Certificate file not found",
        });
      }

      // Generate presigned URL for download
      const downloadUrl = await generatePresignedUrl(
        application.finalCertificate.s3Key,
        300
      ); // 5 minutes

      res.json({
        success: true,
        data: {
          downloadUrl,
          certificateNumber: application.finalCertificate.certificateNumber,
          fileName: application.finalCertificate.originalName,
          expiresIn: 300, // seconds
        },
      });
    } catch (error) {
      console.error("Download certificate error:", error);
      res.status(500).json({
        success: false,
        message: "Error generating download link",
      });
    }
  },

  // Admin: Get all issued certificates
  getAllIssuedCertificates: async (req, res) => {
    try {
      const { page = 1, limit = 10, search } = req.query;

      let matchQuery = {
        overallStatus: "certificate_issued",
        "finalCertificate.s3Key": { $exists: true, $ne: null },
      };

      // Add search functionality
      if (search && search.trim() !== "") {
        const User = require("../models/user");
        const users = await User.find({
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }).select("_id");

        const userIds = users.map((user) => user._id);
        matchQuery.userId = { $in: userIds };
      }

      const applications = await Application.find(matchQuery)
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name description")
        .populate("finalCertificate.uploadedBy", "firstName lastName")
        .sort({ "finalCertificate.uploadedAt": -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Application.countDocuments(matchQuery);

      res.json({
        success: true,
        data: {
          certificates: applications,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      console.error("Get all issued certificates error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching issued certificates",
      });
    }
  },

  // Admin: View certificate (for admin panel)
  viewCertificate: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findOne({
        _id: applicationId,
        "finalCertificate.s3Key": { $exists: true, $ne: null },
      })
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name description")
        .populate("finalCertificate.uploadedBy", "firstName lastName");

      console.log("Viewing certificate:", application);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Certificate not found",
        });
      }

      if (
        !application.finalCertificate ||
        !application.finalCertificate.s3Key
      ) {
        return res.status(404).json({
          success: false,
          message: "Certificate file not found",
        });
      }

      // Generate presigned URL for viewing
      const viewUrl = await generatePresignedUrl(
        application.finalCertificate.s3Key,
        3600
      ); // 1 hour

      res.json({
        success: true,
        data: {
          application,
          viewUrl,
          isExpired: application.finalCertificate.expiryDate
            ? new Date() > application.finalCertificate.expiryDate
            : false,
        },
      });
    } catch (error) {
      console.error("View certificate error:", error);
      res.status(500).json({
        success: false,
        message: "Error viewing certificate",
      });
    }
  },
  // Proxy stream: inline PDF with Range support and correct headers
  streamCertificate: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findOne({
        _id: applicationId,
        "finalCertificate.s3Key": { $exists: true, $ne: null },
      }).select("finalCertificate");

      if (!application) {
        return res.status(404).json({ success: false, message: "Certificate not found" });
      }

      const s3Key = application.finalCertificate.s3Key;
      const range = req.headers.range;
      const params = { Bucket: process.env.AWS_S3_BUCKET_NAME, Key: s3Key };
      if (range) params.Range = range;

      const command = new GetObjectCommand(params);
      const s3Response = await s3Client.send(command);

      if (range && s3Response.ContentRange) {
        res.status(206);
        res.setHeader("Content-Range", s3Response.ContentRange);
        res.setHeader("Accept-Ranges", "bytes");
      }

      const detectedType = s3Response.ContentType || "application/octet-stream";
      res.setHeader("Content-Type", detectedType);
      const filename = application.finalCertificate.originalName || (detectedType.startsWith("image/") ? "certificate.jpg" : "certificate.pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      if (s3Response.ContentLength) res.setHeader("Content-Length", s3Response.ContentLength);
      res.setHeader("Cache-Control", "public, max-age=3600");

      const bodyStream = s3Response.Body;
      bodyStream.on("error", (err) => { console.error("S3 stream error:", err); res.destroy(err); });
      bodyStream.pipe(res);
    } catch (error) {
      console.error("Stream certificate error:", error);
      if (!res.headersSent) res.status(500).json({ success: false, message: "Error streaming certificate" });
    }
  },

  // Generate a presigned URL with inline headers for iframe/react-pdf
  inlineUrl: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const application = await Application.findOne({
        _id: applicationId,
        "finalCertificate.s3Key": { $exists: true, $ne: null },
      }).select("finalCertificate");

      if (!application) {
        return res.status(404).json({ success: false, message: "Certificate not found" });
      }

      const filename = application.finalCertificate.originalName || "certificate.pdf";
      const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filename);
      if (isImage) {
        const directUrl = await generatePresignedUrl(application.finalCertificate.s3Key);
        return res.type("text/plain").send(directUrl);
      }

      const url = await generateInlineSignedUrl(application.finalCertificate.s3Key, {
        expiresIn: 900,
        contentType: "application/pdf",
        contentDisposition: `inline; filename=\"${filename}\"`,
      });
      return res.json({ success: true, data: { url } });
    } catch (error) {
      console.error("Inline URL error:", error);
      res.status(500).json({ success: false, message: "Error generating inline URL" });
    }
  },
};

module.exports = certificateController;
