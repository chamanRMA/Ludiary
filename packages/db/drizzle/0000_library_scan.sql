CREATE TABLE `canonical_games` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`media` text,
	`metadata_source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `canonical_games_title_idx` ON `canonical_games` (`user_id`,`normalized_title`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "devices_kind_check" CHECK("devices"."kind" IN ('local', 'agent'))
);
--> statement-breakpoint
CREATE INDEX `devices_user_idx` ON `devices` (`user_id`,`kind`);--> statement-breakpoint
CREATE TABLE `game_properties` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`canonical_game_id` text,
	`store` text NOT NULL,
	`store_game_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`owned` integer DEFAULT 0 NOT NULL,
	`removed_at` integer,
	`store_metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`canonical_game_id`) REFERENCES `canonical_games`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "game_properties_store_check" CHECK("game_properties"."store" IN ('steam', 'gog', 'epic', 'ubisoft', 'ea', 'manual')),
	CONSTRAINT "game_properties_kind_check" CHECK("game_properties"."kind" IN ('game', 'dlc'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_properties_store_uq` ON `game_properties` (`user_id`,`store`,`store_game_id`);--> statement-breakpoint
CREATE INDEX `game_properties_canonical_idx` ON `game_properties` (`canonical_game_id`);--> statement-breakpoint
CREATE INDEX `game_properties_title_idx` ON `game_properties` (`user_id`,`normalized_title`);--> statement-breakpoint
CREATE TABLE `installations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`property_id` text NOT NULL,
	`device_id` text NOT NULL,
	`install_path` text NOT NULL,
	`launch_data` text,
	`detected_by` text DEFAULT 'scan' NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `game_properties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "installations_detected_by_check" CHECK("installations"."detected_by" IN ('scan', 'library'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `installations_property_device_uq` ON `installations` (`property_id`,`device_id`);--> statement-breakpoint
CREATE TABLE `scan_roots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`origin` text NOT NULL,
	`path` text NOT NULL,
	`path_key` text NOT NULL,
	`declaration_id` text,
	`store` text,
	`tag` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "scan_roots_origin_check" CHECK("scan_roots"."origin" IN ('user', 'discovered'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scan_roots_path_uq` ON `scan_roots` (`user_id`,`device_id`,`origin`,`path_key`);--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text,
	`key` text NOT NULL,
	`value` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_user_key_uq` ON `settings` (`user_id`,`key`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`user_id` text NOT NULL,
	`store` text NOT NULL,
	`operation` text NOT NULL,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`status` text NOT NULL,
	`error_code` text,
	`error_key` text,
	`error_params` text,
	`next_allowed_at` integer,
	PRIMARY KEY(`user_id`, `store`, `operation`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sync_state_operation_check" CHECK("sync_state"."operation" IN ('library', 'scan')),
	CONSTRAINT "sync_state_status_check" CHECK("sync_state"."status" IN ('idle', 'running', 'error'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
