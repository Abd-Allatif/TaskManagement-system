const express = require("express");
const verifyToken = require("../../middleware/auth");
const { resolveWorkspace } = require("../../middleware/workspace");
const { requirePermission } = require("../../middleware/permissions");
const {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} = require("../../controllers/Category/categoryController");
const {
  createCategoryRules,
  updateCategoryRules,
  validate,
} = require("../../middleware/validators/categoryValidators");

const router = express.Router();

// Every category operation is scoped to the X-Workspace-Id workspace.
router.use(verifyToken, resolveWorkspace);

// Both members and platform admins may read and create.
router.get("/", getCategories);
router.get("/:id", getCategoryById);

router.post(
  "/",
  requirePermission("category.create"),
  createCategoryRules,
  validate,
  createCategory
);

// Previously platform-admin-only; now permission-driven via the member role
// (OWNER/ADMIN system roles include these codes).
router.put(
  "/:id",
  requirePermission("category.update"),
  updateCategoryRules,
  validate,
  updateCategory
);

router.delete(
  "/:id",
  requirePermission("category.delete"),
  deleteCategory
);

module.exports = router;
