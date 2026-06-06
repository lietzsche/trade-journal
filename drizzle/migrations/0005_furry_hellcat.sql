ALTER TABLE `calculator_history` ADD `current_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `calculator_history` ADD `ma20` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `calculator_history` ADD `ma60` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `calculator_history` ADD `trend_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `calculator_history` ADD `regime_signal` text DEFAULT '하락 국면 ⚠️' NOT NULL;