ALTER TABLE `users` ADD `passcode_hash` varchar(255);
--> statement-breakpoint
ALTER TABLE `users` ADD `failed_attempts` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` timestamp;
