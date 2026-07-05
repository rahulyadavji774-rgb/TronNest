ALTER TABLE `transaction_history` ADD `direction` varchar(50);--> statement-breakpoint
ALTER TABLE `transaction_history` ADD `asset_symbol` varchar(50);--> statement-breakpoint
ALTER TABLE `transaction_history` ADD `counterparty` varchar(255);--> statement-breakpoint
ALTER TABLE `transaction_history` ADD `fee` decimal(36,18);--> statement-breakpoint
ALTER TABLE `transaction_history` ADD `block_height` bigint;--> statement-breakpoint
ALTER TABLE `transaction_history` ADD `nonce` bigint;--> statement-breakpoint
ALTER TABLE `transaction_history` ADD `gas_used` varchar(255);--> statement-breakpoint
ALTER TABLE `transaction_history` ADD `network` varchar(100);--> statement-breakpoint
ALTER TABLE `transaction_history` ADD `blockchain_tx_id` char(36);