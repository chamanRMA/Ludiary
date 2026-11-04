-- drizzle-kit selected the new columns from the old table; fixed by hand: they start null (ADR 86 point 17).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_price_watch` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`service` text NOT NULL,
	`service_game_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text,
	`added_at` integer NOT NULL,
	`cover_url` text,
	`cover_fallback_url` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "price_watch_service_check" CHECK("__new_price_watch"."service" IN ('itad')),
	CONSTRAINT "price_watch_type_check" CHECK("__new_price_watch"."type" IS NULL OR "__new_price_watch"."type" IN ('game', 'dlc', 'package')),
	CONSTRAINT "price_watch_cover_check" CHECK("__new_price_watch"."cover_url" IS NULL OR length("__new_price_watch"."cover_url") <= 2048),
	CONSTRAINT "price_watch_cover_fallback_check" CHECK("__new_price_watch"."cover_fallback_url" IS NULL OR length("__new_price_watch"."cover_fallback_url") <= 2048)
);
--> statement-breakpoint
INSERT INTO `__new_price_watch`("id", "user_id", "service", "service_game_id", "title", "type", "added_at") SELECT "id", "user_id", "service", "service_game_id", "title", "type", "added_at" FROM `price_watch`;--> statement-breakpoint
DROP TABLE `price_watch`;--> statement-breakpoint
ALTER TABLE `__new_price_watch` RENAME TO `price_watch`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `price_watch_game_uq` ON `price_watch` (`user_id`,`service`,`service_game_id`);