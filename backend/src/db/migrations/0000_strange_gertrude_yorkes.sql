CREATE TABLE `admin_logs` (
	`id` char(36) NOT NULL,
	`admin_id` char(36),
	`action` varchar(255),
	`details` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `admin_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admins` (
	`id` char(36) NOT NULL,
	`username` varchar(100) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` varchar(50) NOT NULL DEFAULT 'viewer',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `admins_id` PRIMARY KEY(`id`),
	CONSTRAINT `admins_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` char(36) NOT NULL,
	`setting_key` varchar(100),
	`setting_value` text,
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` char(36) NOT NULL,
	`actor_id` char(36) NOT NULL,
	`actor_type` varchar(50) NOT NULL,
	`action` varchar(100) NOT NULL,
	`details` json,
	`ip_address` varchar(45),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `balances` (
	`id` char(36) NOT NULL,
	`wallet_id` char(36) NOT NULL,
	`token_id` char(36) NOT NULL,
	`balance` decimal(36,18) NOT NULL DEFAULT '0',
	`is_frozen` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `balances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blockchain_transactions` (
	`id` char(36) NOT NULL,
	`tx_id` varchar(255),
	`wallet_id` char(36),
	`token_id` char(36),
	`amount` decimal(36,18),
	`status` varchar(50),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `blockchain_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` char(36) NOT NULL,
	`user_id` char(36),
	`device_info` varchar(255),
	`last_active` timestamp,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `devices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `internal_ledger` (
	`id` char(36) NOT NULL,
	`from_wallet_id` char(36),
	`to_wallet_id` char(36),
	`token_id` char(36),
	`amount` decimal(36,18),
	`type` varchar(50),
	`status` varchar(50),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `internal_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `network_settings` (
	`id` char(36) NOT NULL,
	`network_name` varchar(100),
	`full_node_url` varchar(255),
	`solidity_node_url` varchar(255),
	`event_server_url` varchar(255),
	`usdt_contract_address` varchar(255),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `network_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` char(36) NOT NULL,
	`user_id` char(36),
	`title` varchar(255),
	`message` text,
	`is_read` boolean DEFAULT false,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` char(36) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` char(36) NOT NULL,
	`user_id` char(36),
	`admin_id` char(36),
	`token` varchar(512) NOT NULL,
	`refresh_token` varchar(512),
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_unique` UNIQUE(`token`),
	CONSTRAINT `sessions_refresh_token_unique` UNIQUE(`refresh_token`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` char(36) NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`category` varchar(100),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `token_prices` (
	`id` char(36) NOT NULL,
	`token_id` char(36) NOT NULL,
	`price_usd` decimal(18,8),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `token_prices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` char(36) NOT NULL,
	`symbol` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`decimals` int NOT NULL DEFAULT 6,
	`logo_url` text,
	`total_supply` decimal(36,18) NOT NULL DEFAULT '0',
	`circulating_supply` decimal(36,18) NOT NULL DEFAULT '0',
	`status` varchar(50) NOT NULL DEFAULT 'active',
	`is_visible` boolean NOT NULL DEFAULT true,
	`description` text,
	`is_transfer_enabled` boolean NOT NULL DEFAULT true,
	`is_internal` boolean NOT NULL DEFAULT true,
	`supply_locked` boolean NOT NULL DEFAULT false,
	`contract_address` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transaction_history` (
	`id` char(36) NOT NULL,
	`wallet_id` char(36),
	`type` varchar(50),
	`amount` decimal(36,18),
	`token_id` char(36),
	`status` varchar(50),
	`tx_hash` varchar(255),
	`internal_ledger_id` char(36),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `transaction_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transaction_logs` (
	`id` char(36) NOT NULL,
	`transaction_id` char(36) NOT NULL,
	`message` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transaction_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` char(36) NOT NULL,
	`tx_hash` varchar(255),
	`from_wallet_id` char(36),
	`to_wallet_id` char(36),
	`token_id` char(36) NOT NULL,
	`amount` decimal(36,18) NOT NULL,
	`fee` decimal(36,18) NOT NULL DEFAULT '0',
	`status` varchar(50) NOT NULL DEFAULT 'pending',
	`type` varchar(50) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `transactions_tx_hash_unique` UNIQUE(`tx_hash`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`username` varchar(100),
	`email` varchar(255),
	`password_hash` varchar(255),
	`seed_phrase_hash` varchar(255),
	`status` varchar(50) NOT NULL DEFAULT 'active',
	`last_login` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	CONSTRAINT `users_seed_phrase_hash_unique` UNIQUE(`seed_phrase_hash`)
);
--> statement-breakpoint
CREATE TABLE `wallet_keys` (
	`id` char(36) NOT NULL,
	`wallet_id` char(36) NOT NULL,
	`public_key` text NOT NULL,
	`encrypted_private_key` text NOT NULL,
	`encrypted_seed_phrase` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallet_keys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallet_logs` (
	`id` char(36) NOT NULL,
	`wallet_id` char(36),
	`action` varchar(255),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `wallet_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallet_security` (
	`id` char(36) NOT NULL,
	`wallet_id` char(36) NOT NULL,
	`passcode_hash` varchar(255),
	`failed_attempts` int DEFAULT 0,
	`locked_until` timestamp,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallet_security_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`address` varchar(100) NOT NULL,
	`name` varchar(100) NOT NULL DEFAULT 'Main Wallet',
	`encrypted_private_key` text,
	`encrypted_seed_phrase` text,
	`is_locked` boolean NOT NULL DEFAULT false,
	`is_frozen` boolean NOT NULL DEFAULT false,
	`status` varchar(50) NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallets_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallets_address_unique` UNIQUE(`address`)
);
--> statement-breakpoint
ALTER TABLE `balances` ADD CONSTRAINT `balances_wallet_id_wallets_id_fk` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `balances` ADD CONSTRAINT `balances_token_id_tokens_id_fk` FOREIGN KEY (`token_id`) REFERENCES `tokens`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transaction_logs` ADD CONSTRAINT `transaction_logs_transaction_id_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_from_wallet_id_wallets_id_fk` FOREIGN KEY (`from_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_to_wallet_id_wallets_id_fk` FOREIGN KEY (`to_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_token_id_tokens_id_fk` FOREIGN KEY (`token_id`) REFERENCES `tokens`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_keys` ADD CONSTRAINT `wallet_keys_wallet_id_wallets_id_fk` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallets` ADD CONSTRAINT `wallets_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `wallet_token_idx` ON `balances` (`wallet_id`,`token_id`);--> statement-breakpoint
CREATE INDEX `tx_id_idx` ON `transaction_logs` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `from_wallet_idx` ON `transactions` (`from_wallet_id`);--> statement-breakpoint
CREATE INDEX `to_wallet_idx` ON `transactions` (`to_wallet_id`);--> statement-breakpoint
CREATE INDEX `token_idx` ON `transactions` (`token_id`);--> statement-breakpoint
CREATE INDEX `wallet_id_idx` ON `wallet_keys` (`wallet_id`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `wallets` (`user_id`);