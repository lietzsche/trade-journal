ALTER TABLE `users` ADD `preferred_currency` text DEFAULT 'KRW' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `exchange_rate` real DEFAULT 1350 NOT NULL;