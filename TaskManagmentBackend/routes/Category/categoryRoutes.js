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

// Any authenticated principal can read categories and create new ones.
router.use(verifyToken);

// Every principal can create; edit/delete remain admin-only.
router.post("/", createCategoryRules, validate, createCategory);

router.get("/", getCategories);
router.get("/:id", getCategoryById);

router.put("/:id", verifyAdmin, updateCategoryRules, validate, updateCategory);

router.delete("/:id", verifyAdmin, deleteCategory);

module.exports = router;