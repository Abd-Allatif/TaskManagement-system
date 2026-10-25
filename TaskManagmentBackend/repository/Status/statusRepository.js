const prisma = require("../../prismaClient");

const getStatuses = () => prisma.status.findMany({ orderBy: { label: "asc" } });

const getStatusById = (id) => prisma.status.findUnique({ where: { id } });

const getStatusByCode = (code) => prisma.status.findUnique({ where: { code } });

const createStatus = (data) => prisma.status.create({ data });

const updateStatus = (id, data) => prisma.status.update({ where: { id }, data });

const deleteStatus = (id) => prisma.status.delete({ where: { id } });

module.exports = {
  getStatuses,
  getStatusById,
  getStatusByCode,
  createStatus,
  updateStatus,
  deleteStatus,
};
