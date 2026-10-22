CREATE TABLE `secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`name` text NOT NULL,
	`ciphertext` text NOT NULL,
	`key_id` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `secrets_user_scope_name_uq` ON `secrets` (`user_id`,`scope`,`name`);--> statement-breakpoint
CREATE TABLE `store_connections` (
	`user_id` text NOT NULL,
	`store` text NOT NULL,
	`status` text NOT NULL,
	`account_label` text,
	`connected_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `store`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "store_connections_status_check" CHECK("store_connections"."status" IN ('connected', 'expired'))
);
--> statement-breakpoint
ALTER TABLE `game_properties` ADD `store_playtime_minutes` integer;--> statement-breakpoint
ALTER TABLE `game_properties` ADD `store_last_played_at` integer;