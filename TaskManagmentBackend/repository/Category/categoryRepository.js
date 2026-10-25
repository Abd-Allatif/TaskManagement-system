const prisma = require("../../prismaClient");

const createCategory = (data) => prisma.category.create({ data });

const getCategories = () => prisma.category.findMany({
    orderBy: {createdAt: "desc"}
});

const getCategoryById = (id) => prisma.category.findFirst({
    where: {id}
});

const updateCategory = (id, data) => prisma.category.update({
    where: {id}, data
});

const deleteCategory = (id) => prisma.category.delete({where: {id}});

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};