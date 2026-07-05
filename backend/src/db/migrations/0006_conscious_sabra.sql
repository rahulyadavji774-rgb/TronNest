ALTER TABLE `wallet_logs` ADD `actor_id` char(36);--> statement-breakpoint
ALTER TABLE `wallet_logs` ADD `status` varchar(50);--> statement-breakpoint
ALTER TABLE `wallet_logs` ADD `device` varchar(255);--> statement-breakpoint
ALTER TABLE `wallet_logs` ADD `ip` varchar(45);