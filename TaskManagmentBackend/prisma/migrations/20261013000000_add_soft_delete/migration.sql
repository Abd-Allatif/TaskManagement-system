-- Reconstructed on 2026-10-31: this migration was applied to the database on
-- 2026-10-13 but its migration.sql file was lost (the directory was empty).
-- The SQL below was rebuilt from the live schema (SHOW COLUMNS / SHOW INDEX),
-- so re-running it against a database that already has these changes is a
-- no-op; a fresh environment applies it to match.

-- AlterTable
ALTER TABLE `users` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- DropIndex
DROP INDEX `users_email_key` ON `users`;

-- CreateIndex
CREATE UNIQUE INDEX `users_email_deleted_at_key` ON `users`(`email`, `deleted_at`);

-- AlterTable
ALTER TABLE `admins` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- DropIndex
DROP INDEX `admins_email_key` ON `admins`;

-- CreateIndex
CREATE UNIQUE INDEX `admins_email_deleted_at_key` ON `admins`(`email`, `deleted_at`);

-- AlterTable
ALTER TABLE `categories` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `categories_name_deleted_at_key` ON `categories`(`name`, `deleted_at`);

-- AlterTable
ALTER TABLE `statuses` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- DropIndex
DROP INDEX `statuses_code_key` ON `statuses`;

-- CreateIndex
CREATE UNIQUE INDEX `statuses_code_deleted_at_key` ON `statuses`(`code`, `deleted_at`);
