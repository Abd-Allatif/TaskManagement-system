const express = require("express");
const verifyToken = require("../../middleware/auth");
const verifyAdmin = require("../../middleware/adminAuth");
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

// Any authenticated principal can read categories.
router.use(verifyToken);

// Writes are admin-only.
router.post("/", verifyAdmin, createCategoryRules, validate, createCategory);

router.get("/", getCategories);
router.get("/:id", getCategoryById);

router.put("/:id", verifyAdmin, updateCategoryRules, validate, updateCategory);

router.delete("/:id", verifyAdmin, deleteCategory);

module.exports = router;