const express = require("express");
const verifyToken = require("../../middleware/auth");
const workspaceRepository = require("../../repository/Workspace/workspaceRepository");

const router = express.Router();

// The permission catalog is global read data — any authenticated principal
// can read it (needed to compose/create roles in the UI).
router.use(verifyToken);

router.get("/", async (req, res, next) => {
  try {
    const permissions = await workspaceRepository.getPermissions();
    return res.status(200).json({ permissions });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
