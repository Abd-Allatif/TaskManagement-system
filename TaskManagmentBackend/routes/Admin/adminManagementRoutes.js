const express = require("express");
const verifyAdmin = require("../../middleware/adminAuth");
const {
  getUsers,
  getAdmins,
  getOverview,
  createStatus,
  updateStatus,
  deleteStatus,
} = require("../../controllers/Admin/adminManagementController");
const { statusRules, validate } = require("../../middleware/validators/statusValidators");

const router = express.Router();

// Every management route requires a valid ADMIN token.
router.use(verifyAdmin);

// Listings & dashboard
router.get("/users", getUsers);
router.get("/admins", getAdmins);
router.get("/overview", getOverview);

// Status management
router.post("/statuses", statusRules, validate, createStatus);
router.put("/statuses/:id", statusRules, validate, updateStatus);
router.delete("/statuses/:id", deleteStatus);

module.exports = router;
