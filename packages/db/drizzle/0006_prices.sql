CREATE TABLE `price_links` (
	`user_id` text NOT NULL,
	`canonical_game_id` text NOT NULL,
	`service` text NOT NULL,
	`service_game_id` text,
	`status` text NOT NULL,
	`source` text,
	`inputs_hash` text NOT NULL,
	`looked_up_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `canonical_game_id`, `service`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`canonical_game_id`) REFERENCES `canonical_games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "price_links_service_check" CHECK("price_links"."service" IN ('itad')),
	CONSTRAINT "price_links_status_check" CHECK("price_links"."status" IN ('found', 'not-found', 'conflict', 'excluded')),
	CONSTRAINT "price_links_source_check" CHECK("price_links"."source" IS NULL OR "price_links"."source" IN ('steam', 'gog', 'title'))
);
--> statement-breakpoint
CREATE INDEX `price_links_service_game_idx` ON `price_links` (`user_id`,`service`,`service_game_id`);--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`user_id` text NOT NULL,
	`service` text NOT NULL,
	`service_game_id` text NOT NULL,
	`country` text NOT NULL,
	`shops` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `service`, `service_game_id`, `country`, `shops`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "price_snapshots_service_check" CHECK("price_snapshots"."service" IN ('itad')),
	CONSTRAINT "price_snapshots_country_check" CHECK(length("price_snapshots"."country") = 2),
	CONSTRAINT "price_snapshots_shops_check" CHECK("price_snapshots"."shops" IN ('ludiary', 'all'))
);
--> statement-breakpoint
CREATE TABLE `price_watch` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`service` text NOT NULL,
	`service_game_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "price_watch_service_check" CHECK("price_watch"."service" IN ('itad')),
	CONSTRAINT "price_watch_type_check" CHECK("price_watch"."type" IS NULL OR "price_watch"."type" IN ('game', 'dlc', 'package'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_watch_game_uq` ON `price_watch` (`user_id`,`service`,`service_game_id`);