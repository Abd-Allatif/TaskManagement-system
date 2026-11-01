const prisma = require("../../prismaClient");

const getStatuses = () =>
  prisma.status.findMany({ where: { deletedAt: null }, orderBy: { label: "asc" } });

const getStatusById = (id) => prisma.status.findUnique({ where: { id } });

// The code uniqueness is a (code, deleted_at) composite, so live lookups
// are findFirst filtered to non-deleted rows.
const getStatusByCode = (code) =>
  prisma.status.findFirst({ where: { code, deletedAt: null } });

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
