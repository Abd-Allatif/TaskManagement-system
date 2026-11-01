require("dotenv").config();
const prisma = require("../../prismaClient");
const { seedPermissions } = require("../../repository/Workspace/workspaceRepository");

const run = async () => {
  const permissions = await seedPermissions();
  console.log(`Permission catalog seeded (${permissions.length} permissions).`);
};

run().finally(() => prisma.$disconnect());
