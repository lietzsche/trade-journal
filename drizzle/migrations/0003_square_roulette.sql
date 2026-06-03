ALTER TABLE `portfolio` ADD `trailing_target_percent` real DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `portfolio` ADD `trailing_stop_percent` real DEFAULT 5 NOT NULL;