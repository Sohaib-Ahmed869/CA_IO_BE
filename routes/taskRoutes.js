// routes/taskRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const taskController = require("../controllers/taskController");

// All routes require authentication
router.use(authenticate);

// Task CRUD operations
router.post("/", taskController.createTask);
router.get("/", taskController.getTasks);
router.get("/stats", taskController.getTaskStats);
router.get("/users/available", taskController.getAvailableUsers);
router.get("/:taskId", taskController.getTaskById);
router.put("/:taskId", taskController.updateTask);
router.put("/:taskId/status", taskController.updateTaskStatus);
router.delete("/:taskId", taskController.deleteTask);
router.post("/:taskId/comments", taskController.addComment);

module.exports = router;
