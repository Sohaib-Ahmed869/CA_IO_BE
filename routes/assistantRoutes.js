// routes/assistantRoutes.js
const express = require("express");
const multer = require("multer");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const assistantController = require("../controllers/assistantController");

// Voice clips are held in memory only — they are transcribed and discarded,
// never written to disk or S3. 25MB is Whisper's own per-file ceiling.
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^audio\//.test(file.mimetype) || /^video\/webm/.test(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Only audio uploads are accepted"));
  },
});

// The assistant always answers about the caller's own account, so every route
// requires authentication and none of them accept a user id from the client.
router.use(authenticate);

router.get("/config", assistantController.getConfig);
router.post("/chat", assistantController.chat);
// Wrap the upload so multer's own rejections (wrong type, too large) come back
// as a clear 400 the widget can show, rather than surfacing as a server error.
const acceptAudio = (req, res, next) => {
  audioUpload.single("audio")(req, res, (err) => {
    if (!err) return next();

    const tooLarge = err.code === "LIMIT_FILE_SIZE";
    return res.status(400).json({
      success: false,
      code: tooLarge ? "AUDIO_TOO_LARGE" : "AUDIO_INVALID",
      message: tooLarge
        ? "That recording is too long. Please keep it under 25MB."
        : "That file isn't audio. Please record your question or type it instead.",
    });
  });
};

router.post("/transcribe", acceptAudio, assistantController.transcribe);
router.post("/speak", assistantController.speak);
router.get("/context", assistantController.getContext);

module.exports = router;
