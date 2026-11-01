const prisma = require("../../prismaClient");

// Email uniqueness is a (email, deleted_at) composite, so live lookups are
// findFirst filtered to non-deleted rows.
const findByEmail = (email) =>
  prisma.admin.findFirst({ where: { email, deletedAt: null } });

const findById = (id) => prisma.admin.findUnique({ where: { id } });

const findAllUsers = () =>
  prisma.user.findMany({ orderBy: { createdAt: "desc" } });

const findAllAdmins = () =>
  prisma.admin.findMany({ orderBy: { createdAt: "desc" } });

const getOverview = async () => {
  const users = await prisma.user.count();
  const admins = await prisma.admin.count();
  const tasks = await prisma.task.count({ where: { deletedAt: null } });
  const categories = await prisma.category.count();
  const statuses = await prisma.status.count();
  const tasksByStatus = await prisma.task.groupBy({
    by: ["statusId"],
    where: { deletedAt: null },
    _count: { _all: true },
  });

  return { users, admins, tasks, categories, statuses, tasksByStatus };
};

const findByEmailWithTokens = (email) =>
  prisma.admin.findFirst({
    where: { email, deletedAt: null },
    include: { adminVerificationTokens: true },
  });

const createAdmin = (data) => prisma.admin.create({ data });

const createVerificationToken = (data) =>
  prisma.adminVerificationToken.create({ data });

const deleteVerificationTokensByAdminId = (adminId) =>
  prisma.adminVerificationToken.deleteMany({ where: { adminId } });

const consumeVerificationToken = (adminId, tokenId) =>
  prisma.$transaction([
    prisma.admin.update({
      where: { id: adminId },
      data: { emailVerifiedAt: new Date(), isVerified: true },
    }),
    prisma.adminVerificationToken.delete({ where: { id: tokenId } }),
  ]);

module.exports = {
  findById,
  findByEmail,
  findAllUsers,
  findAllAdmins,
  getOverview,
  findByEmailWithTokens,
  createAdmin,
  createVerificationToken,
  deleteVerificationTokensByAdminId,
  consumeVerificationToken,
};
