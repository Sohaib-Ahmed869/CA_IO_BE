// config/s3Config.js
const {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");
const multerS3 = require("multer-s3");
const path = require("path");
const crypto = require("crypto");

// Configure AWS S3 Client (v3)
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-southeast-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Simple file type validation
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
  "video/mp4",
  "video/mov",
  "video/avi",
  "video/quicktime",
  // ADD THESE TWO LINES:
  "application/msword", // .doc files
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx files
];

const FILE_SIZE_LIMITS = {
  "image/jpeg": 30 * 1024 * 1024, // 10MB
  "image/jpg": 30 * 1024 * 1024,
  "image/png": 30 * 1024 * 1024,
  "application/pdf": 50 * 1024 * 1024, // 50MB
  "video/mp4": 100 * 1024 * 1024, // 100MB
  "video/mov": 100 * 1024 * 1024,
  "video/avi": 100 * 1024 * 1024,
  "video/quicktime": 100 * 1024 * 1024,
  // ADD THESE TWO LINES:
  "application/msword": 30 * 1024 * 1024, // 30MB for .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 30 * 1024 * 1024, // 30MB for .docx
};

// Generate unique file name
const generateFileName = (originalName, userId) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString("hex");
  const extension = path.extname(originalName);
  return `documents/${userId}/${timestamp}-${randomString}${extension}`;
};

// File filter
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type"), false);
  }
};

// Multer S3 upload configuration (works with both v2 and v3)
const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    acl: "private",
    metadata: function (req, file, cb) {
      cb(null, {
        originalName: file.originalname,
        uploadedBy: req.user?.id || "unknown",
        uploadedAt: new Date().toISOString(),
      });
    },
    key: function (req, file, cb) {
      const fileName = generateFileName(file.originalname, req.user.id);
      cb(null, fileName);
    },
  }),
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
    files: 50, // Max 50 files per request
  },
});

// Generate presigned URL (AWS SDK v3)
const generatePresignedUrl = async (s3Key, expiresIn = 3600) => {
  // Since bucket is public, use direct URLs instead of presigned URLs
  const bucketName = process.env.S3_BUCKET_NAME || "certifiediobucket";

  // Use the standard S3 URL format
  const directUrl = `https://${bucketName}.s3.amazonaws.com/${s3Key}`;


  return directUrl;
};
// Generate CloudFront URL (optional - only if you have CloudFront)
const generateCloudFrontUrl = (s3Key) => {
  if (process.env.CLOUDFRONT_DOMAIN) {
    return `https://${process.env.CLOUDFRONT_DOMAIN}/${s3Key}`;
  }
  return null; // Return null if no CloudFront
};

// Delete file from S3 (AWS SDK v3)
const deleteFileFromS3 = async (s3Key) => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: s3Key,
  });

  try {
    await s3Client.send(command);
    return { success: true };
  } catch (error) {
    console.error("S3 delete error:", error);
    return { success: false, error: error.message };
  }
};

// Get file metadata from S3 (AWS SDK v3)
const getFileMetadata = async (s3Key) => {
  const command = new HeadObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: s3Key,
  });

  try {
    const result = await s3Client.send(command);
    return {
      success: true,
      metadata: result.Metadata,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      lastModified: result.LastModified,
    };
  } catch (error) {
    console.error("S3 metadata error:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  s3Client, // Changed from s3 to s3Client
  upload,
  generatePresignedUrl,
  generateCloudFrontUrl,
  deleteFileFromS3,
  getFileMetadata,
  ALLOWED_MIME_TYPES,
  FILE_SIZE_LIMITS,
};
