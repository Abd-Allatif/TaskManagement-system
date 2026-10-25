const express = require("express");
const verifyToken = require("../../middleware/auth");
const {
  getStatuses,
  getStatusById,
} = require("../../controllers/Status/statusController");

const router = express.Router();

// Reading the task statuses is available to any authenticated principal.
router.use(verifyToken);

router.get("/", getStatuses);
router.get("/:id", getStatusById);

module.exports = router;
