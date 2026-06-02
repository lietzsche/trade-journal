ALTER TABLE `portfolio` ADD `currency` text DEFAULT 'KRW' NOT NULL;--> statement-breakpoint
ALTER TABLE `portfolio_transactions` ADD `currency` text DEFAULT 'KRW' NOT NULL;