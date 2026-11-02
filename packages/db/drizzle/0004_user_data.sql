CREATE TABLE `collection_games` (
	`collection_id` text NOT NULL,
	`canonical_game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`position` integer NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`collection_id`, `canonical_game_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`canonical_game_id`) REFERENCES `canonical_games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `collection_games_game_idx` ON `collection_games` (`canonical_game_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_user_key_uq` ON `collections` (`user_id`,`name_key`);--> statement-breakpoint
CREATE TABLE `game_tags` (
	`canonical_game_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`canonical_game_id`, `tag_id`),
	FOREIGN KEY (`canonical_game_id`) REFERENCES `canonical_games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `game_tags_tag_idx` ON `game_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_key_uq` ON `tags` (`user_id`,`name_key`);--> statement-breakpoint
CREATE TABLE `user_game_data` (
	`canonical_game_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`favorite` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`canonical_game_id`) REFERENCES `canonical_games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "user_game_data_favorite_check" CHECK("user_game_data"."favorite" IN (0, 1))
);
