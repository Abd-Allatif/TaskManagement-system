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
            where: {code: status.code},
            update: {},
            create: status
        });
    }
    console.log("Statuses Seeded.");
};

run().finally(() => prisma.$disconnect());