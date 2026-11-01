require("dotenv").config();
const prisma = require("../../prismaClient");

const STATUSES = [
    {code: "PENDING", label: "Pending"},
    {code: "IN_PROGRESS", label: "In Progress"},
    {code: "COMPLETED", label: "Completed"}
];

const run = async () => {
    for (const status of STATUSES) {
        await prisma.status.upsert({
            // The code uniqueness is a (code, deleted_at) composite.
            where: { code_deletedAt: { code: status.code, deletedAt: null } },
            update: {},
            create: status
        });
    }
    console.log("Statuses Seeded.");
};

run().finally(() => prisma.$disconnect());