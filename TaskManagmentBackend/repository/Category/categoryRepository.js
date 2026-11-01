const prisma = require("../../prismaClient");

const createCategory = ({ workspaceId, name, color }) =>
  prisma.category.create({
    data: {
      workspaceId,
      name,
      color: color || null,
    },
  });

const getCategories = (workspaceId) =>
  prisma.category.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });

const getCategoryById = (workspaceId, id) =>
  prisma.category.findFirst({
    where: { id, workspaceId, deletedAt: null },
  });

// The caller must have loaded the category through getCategoryById first, so
// the mutation cannot cross workspaces.
const updateCategory = (id, data) =>
  prisma.category.update({
    where: { id },
    data,
  });

const deleteCategory = (id) => prisma.category.delete({ where: { id } });

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
