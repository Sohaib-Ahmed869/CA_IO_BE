// middleware/upload.js
const multer = require("multer");
const multerS3 = require("multer-s3");
const { s3Client } = require("../config/s3Config");
const logme = require("../utils/logger");

// File type validation for signatures
const signatureFileFilter = (req, file, cb) => {
  // Only allow image files for signatures
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed for signatures"), false);
  }
};

// Generate unique filename for signatures
const generateSignatureFileName = (originalName, userId) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = originalName.split('.').pop().toLowerCase();
  return `signatures/${userId}/${timestamp}-${randomString}.${extension}`;
};

// Signature upload configuration
const signatureUpload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME,
    acl: "private",
    metadata: function (req, file, cb) {
      cb(null, {
        originalName: file.originalname,
        uploadedBy: req.user?.id || "unknown",
        uploadedAt: new Date().toISOString(),
        fileType: "signature"
      });
    },
    key: function (req, file, cb) {
      const fileName = generateSignatureFileName(file.originalname, req.user?.id || "unknown");
      cb(null, fileName);
    },
  }),
  fileFilter: signatureFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max for signatures
    files: 1, // Only 1 file per request for signatures
  },
});

// General upload configuration (for other file types)
const generalUpload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME,
    acl: "private",
    metadata: function (req, file, cb) {
      cb(null, {
        originalName: file.originalname,
        uploadedBy: req.user?.id || "unknown",
        uploadedAt: new Date().toISOString(),
      });
    },
    key: function (req, file, cb) {
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const extension = file.originalname.split('.').pop().toLowerCase();
      const userId = req.user?.id || "unknown";
      return `uploads/${userId}/${timestamp}-${randomString}.${extension}`;
    },
  }),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
    files: 25, // Max 25 files per request
  },
});

// Error handling middleware
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Please upload a smaller file.',
        error: error.message
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Please upload fewer files.',
        error: error.message
      });
    }
    return res.status(400).json({
      success: false,
      message: 'File upload error',
      error: error.message
    });
  }
  
  if (error.message.includes('Only image files are allowed')) {
    return res.status(400).json({
      success: false,
      message: 'Only image files are allowed for signatures.',
      error: error.message
    });
  }
  
  logme.error('Upload middleware error:', error);
  return res.status(500).json({
    success: false,
    message: 'Internal server error during file upload',
    error: error.message
  });
};

module.exports = {
  signatureUpload,
  generalUpload,
  handleUploadError
};
