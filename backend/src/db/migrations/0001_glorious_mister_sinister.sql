ALTER TABLE `sessions` ADD `ip_address` varchar(45);--> statement-breakpoint
ALTER TABLE `sessions` ADD `user_agent` text;--> statement-breakpoint
ALTER TABLE `users` ADD `passcode_hash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `failed_attempts` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` timestamp;