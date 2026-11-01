const categoryRepo = require("../../repository/Category/categoryRepository");

const createCategory = async (req, res) => {
  const { name, color } = req.body;

  // Categories are scoped to the active workspace like tasks.
  const category = await categoryRepo.createCategory({
    workspaceId: req.workspace.id,
    name,
    color: color || null,
  });

  return res
    .status(201)
    .json({ message: "Category created successfully", category });
};

const getCategories = async (req, res) => {
  const categories = await categoryRepo.getCategories(req.workspace.id);

  return res.status(200).json({ categories });
};

const getCategoryById = async (req, res) => {
  // Workspace-scoped lookup: other workspaces' categories 404 here.
  const category = await categoryRepo.getCategoryById(
    req.workspace.id,
    req.params.id
  );

  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }

  return res.status(200).json({ category });
};

const updateCategory = async (req, res) => {
  const { name, color } = req.body;

  const category = await categoryRepo.getCategoryById(
    req.workspace.id,
    req.params.id
  );

  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }

  const updated = await categoryRepo.updateCategory(category.id, {
    name,
    color: color || null,
  });

  return res
    .status(200)
    .json({ message: "Category updated successfully", category: updated });
};

const deleteCategory = async (req, res) => {
  const category = await categoryRepo.getCategoryById(
    req.workspace.id,
    req.params.id
  );

  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }

  await categoryRepo.deleteCategory(category.id);

  return res
    .status(200)
    .json({ message: "Category deleted successfully" });
};

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
