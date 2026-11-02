DROP INDEX `collections_user_key_uq`;--> statement-breakpoint
ALTER TABLE `collections` ADD `source_store` text;--> statement-breakpoint
ALTER TABLE `collections` ADD `source_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `collections_source_uq` ON `collections` (`user_id`,`source_store`,`source_id`) WHERE "collections"."source_store" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `collections_user_key_uq` ON `collections` (`user_id`,`name_key`) WHERE "collections"."source_store" IS NULL;