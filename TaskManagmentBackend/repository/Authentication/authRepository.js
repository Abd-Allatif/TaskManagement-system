const prisma = require("../../prismaClient");

const findById = (id) => prisma.user.findUnique({ where: { id } });

// The email uniqueness is a (email, deleted_at) composite, so live lookups
// are findFirst filtered to non-deleted rows.
const findByEmail = (email) =>
  prisma.user.findFirst({ where: { email, deletedAt: null } });

const findByEmailWithTokens = (email) =>
  prisma.user.findFirst({
    where: { email, deletedAt: null },
    include: { verificationTokens: true },
  });

const createUser = (data) => prisma.user.create({ data });

const createVerificationToken = (data) =>
  prisma.verificationToken.create({ data });

const markEmailVerified = (userId) =>
  prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  });

const deleteVerificationToken = (tokenId) =>
  prisma.verificationToken.delete({ where: { id: tokenId } });

// Drops every token belonging to a user so only the newest code stays valid.
const deleteVerificationTokensByUserId = (userId) =>
  prisma.verificationToken.deleteMany({ where: { userId } });

const consumeVerificationToken = (userId, tokenId) =>
  prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date(), isVerified: true },
    }),
    prisma.verificationToken.delete({ where: { id: tokenId } }),
  ]);

module.exports = {
  findById,
  findByEmail,
  findByEmailWithTokens,
  createUser,
  createVerificationToken,
  markEmailVerified,
  deleteVerificationToken,
  deleteVerificationTokensByUserId,
  consumeVerificationToken,
};
