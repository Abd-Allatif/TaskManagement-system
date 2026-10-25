const categoryRepo = require("../../repository/Category/categoryRepository");

const createCategory = async (req, res) => {
  const { name, color } = req.body;

  const category = await categoryRepo.createCategory({
    name,
    color: color || null,
  });

  return res
    .status(201)
    .json({ message: "Category created successfully", category });
};

const getCategories = async (req, res) => {
  const categories = await categoryRepo.getCategories();

  return res.status(200).json({ categories });
};

const getCategoryById = async (req, res) => {
  const category = await categoryRepo.getCategoryById(req.params.id);

  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }

  return res.status(200).json({ category });
};

const updateCategory = async (req, res) => {
  const { name, color } = req.body;

  const category = await categoryRepo.updateCategory(req.params.id, {
    name,
    color,
  });

  return res.status(200).json({ message: "Category updated successfully", category });
};

const deleteCategory = async (req, res) => {
    await categoryRepo.deleteCategory(req.params.id);

    return res.status(200).json({message: "Category deleted successfully"});
}

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};