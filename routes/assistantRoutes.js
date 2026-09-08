// routes/assistantRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const assistantController = require("../controllers/assistantController");

// The assistant always answers about the caller's own account, so every route
// requires authentication and none of them accept a user id from the client.
router.use(authenticate);

router.get("/config", assistantController.getConfig);
router.post("/chat", assistantController.chat);
router.get("/context", assistantController.getContext);

module.exports = router;
