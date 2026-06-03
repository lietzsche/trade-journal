CREATE TABLE `calculator_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`ticker` text NOT NULL,
	`period` text NOT NULL,
	`base_price` real NOT NULL,
	`high_price` real NOT NULL,
	`low_price` real NOT NULL,
	`risk_reward` real NOT NULL,
	`rec_stop` integer NOT NULL,
	`rec_target` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
