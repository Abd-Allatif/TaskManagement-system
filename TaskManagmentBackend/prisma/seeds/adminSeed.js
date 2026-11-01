require("dotenv").config();
const bcrypt = require("bcrypt");
const prisma = require("../../prismaClient");

const run = async () => {
  const ADMINS = [
    {
      name: "Admin",
      email: "admin@admin.net",
      emailVerifiedAt: new Date(),
      isVerified: true,
      password: await bcrypt.hash("123456789", 10),
    },
  ];
  for (const admin of ADMINS) {
    await prisma.admin.upsert({
      // Live admins are matched on the (email, deleted_at) composite input.
      where: {
        email_deletedAt: { email: admin.email, deletedAt: null },
      },
      update: {},
      create: admin,
    });
  }

  console.log("Admin Seeded");
};

run().finally(() => prisma.$disconnect());
