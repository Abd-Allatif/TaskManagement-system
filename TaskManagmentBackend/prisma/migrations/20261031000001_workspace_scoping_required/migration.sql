-- Makes the workspace scope mandatory. prisma/seeds/backfillWorkspaces.js
-- must have been run first — it assigns every legacy task and category to a
-- workspace (its output must report 0 rows without a workspace).

-- AlterTable
ALTER TABLE `tasks` MODIFY `workspace_id` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `categories` MODIFY `workspace_id` VARCHAR(191) NOT NULL;
