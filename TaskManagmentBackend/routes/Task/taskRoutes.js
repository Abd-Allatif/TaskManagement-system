const express = require("express");
const verifyToken = require("../../middleware/auth");
const { taskOwnerOrAdmin } = require("../../middleware/authorization");
const {
  createTask,
  getTaskById,
  getTasks,
  updateTask,
  deleteTask,
} = require("../../controllers/Task/taskController");
const { createTaskRules,updateTaskRules, validate } = require("../../middleware/validators/taskValidators");

const router = express.Router();

// All task routes require authentication
router.use(verifyToken);

// Create
router.post("/", createTaskRules, validate, createTask);

// Read
router.get("/", getTasks);
router.get("/:id", getTaskById);

// Update (owner or admin only)
router.put("/:id",updateTaskRules,validate , taskOwnerOrAdmin, updateTask);

// Delete (soft) — owner or admin only
router.delete("/:id", taskOwnerOrAdmin, deleteTask);

module.exports = router;
