ALTER TABLE `blockchain_transactions` ADD `tx_hash` varchar(255);--> statement-breakpoint
ALTER TABLE `blockchain_transactions` ADD `from_address` varchar(255);--> statement-breakpoint
ALTER TABLE `blockchain_transactions` ADD `to_address` varchar(255);--> statement-breakpoint
ALTER TABLE `blockchain_transactions` ADD `fee` decimal(36,18);