-- TronNest MySQL Production Schema DDL
-- Highly scalable schema supporting multi-tenant wallets, real TRON blockchain sync, and high-performance internal ledger.

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Users Table (Deterministic, Seed Phrase-Based Identity)
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `seed_phrase_hash` VARCHAR(64) NOT NULL UNIQUE COMMENT 'SHA-256 hash of seed phrase to prevent duplicates',
  `status` ENUM('active', 'suspended', 'frozen') DEFAULT 'active' NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `idx_users_hash` (`seed_phrase_hash`),
  INDEX `idx_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Wallets Table (Encrypted Secret Persistence)
CREATE TABLE IF NOT EXISTS `wallets` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `address` VARCHAR(34) NOT NULL UNIQUE COMMENT 'TRON Base58 Wallet Address',
  `encrypted_seed` TEXT NOT NULL COMMENT 'AES-256-GCM encrypted seed phrase representation',
  `encrypted_private_key` TEXT NOT NULL COMMENT 'AES-256-GCM encrypted private key',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_wallets_user` (`user_id`),
  INDEX `idx_wallets_address` (`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. WalletSecurity Table (6-digit Passcode Control)
CREATE TABLE IF NOT EXISTS `wallet_security` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `wallet_id` BIGINT UNSIGNED NOT NULL UNIQUE,
  `passcode_hash` VARCHAR(60) NOT NULL COMMENT 'Bcrypt-hashed 6-digit passcode',
  `failed_attempts` INT UNSIGNED DEFAULT 0 NOT NULL,
  `locked_until` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`wallet_id`) REFERENCES `wallets` (`id`) ON DELETE CASCADE,
  INDEX `idx_security_wallet` (`wallet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tokens Table (Supports TRX, USDT, and Unlimited Admin Internal Tokens)
CREATE TABLE IF NOT EXISTS `tokens` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `symbol` VARCHAR(20) NOT NULL UNIQUE,
  `decimals` TINYINT UNSIGNED DEFAULT 6 NOT NULL COMMENT 'TRX has 6, USDT has 6, Custom can vary',
  `logo_url` TEXT NULL,
  `is_visible` BOOLEAN DEFAULT TRUE NOT NULL,
  `is_transfer_enabled` BOOLEAN DEFAULT TRUE NOT NULL,
  `is_active` BOOLEAN DEFAULT TRUE NOT NULL,
  `is_internal` BOOLEAN DEFAULT FALSE NOT NULL COMMENT 'True if internal ledger token; False if TRON asset',
  `contract_address` VARCHAR(34) NULL COMMENT 'NULL for TRX/Internal; Contract Address for TRC-20 (e.g. USDT)',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `idx_tokens_symbol` (`symbol`),
  INDEX `idx_tokens_is_internal` (`is_internal`),
  INDEX `idx_tokens_contract` (`contract_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default TRON network tokens
INSERT INTO `tokens` (`id`, `name`, `symbol`, `decimals`, `logo_url`, `is_visible`, `is_transfer_enabled`, `is_active`, `is_internal`, `contract_address`) VALUES
(1, 'TRON', 'TRX', 6, 'https://cryptologos.cc/logos/tron-trx-logo.png', TRUE, TRUE, TRUE, FALSE, NULL),
(2, 'Tether USD', 'USDT', 6, 'https://cryptologos.cc/logos/tether-usdt-logo.png', TRUE, TRUE, TRUE, FALSE, 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t') -- Default USDT on TRON Mainnet
ON DUPLICATE KEY UPDATE `name`=`name`;

-- 5. TokenPrices Table (Dynamic pricing matrix for real-time asset valuation)
CREATE TABLE IF NOT EXISTS `token_prices` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `token_id` BIGINT UNSIGNED NOT NULL UNIQUE,
  `price_usd` DECIMAL(24, 8) DEFAULT 1.00000000 NOT NULL COMMENT 'Exchange rate to USD',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`token_id`) REFERENCES `tokens` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Balances Table (Tracks balance of specific tokens per wallet)
CREATE TABLE IF NOT EXISTS `balances` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `wallet_id` BIGINT UNSIGNED NOT NULL,
  `token_id` BIGINT UNSIGNED NOT NULL,
  `balance` DECIMAL(36, 18) DEFAULT 0.000000000000000000 NOT NULL COMMENT 'Support high-precision balances',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `uk_wallet_token` (`wallet_id`, `token_id`),
  FOREIGN KEY (`wallet_id`) REFERENCES `wallets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`token_id`) REFERENCES `tokens` (`id`) ON DELETE CASCADE,
  INDEX `idx_balances_wallet` (`wallet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. InternalLedger Table (Double-entry transaction bookkeeper for off-chain tokens)
CREATE TABLE IF NOT EXISTS `internal_ledger` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `from_wallet_id` BIGINT UNSIGNED NULL COMMENT 'NULL represents Mint/System deposit',
  `to_wallet_id` BIGINT UNSIGNED NULL COMMENT 'NULL represents Deduction/System withdrawal',
  `token_id` BIGINT UNSIGNED NOT NULL,
  `amount` DECIMAL(36, 18) NOT NULL,
  `description` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`from_wallet_id`) REFERENCES `wallets` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`to_wallet_id`) REFERENCES `wallets` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`token_id`) REFERENCES `tokens` (`id`) ON DELETE CASCADE,
  INDEX `idx_ledger_from` (`from_wallet_id`),
  INDEX `idx_ledger_to` (`to_wallet_id`),
  INDEX `idx_ledger_token` (`token_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. BlockchainTransactions Table (Caches TRON transaction records)
CREATE TABLE IF NOT EXISTS `blockchain_transactions` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `wallet_id` BIGINT UNSIGNED NOT NULL,
  `tx_hash` VARCHAR(64) NOT NULL UNIQUE,
  `token_id` BIGINT UNSIGNED NOT NULL,
  `from_address` VARCHAR(34) NOT NULL,
  `to_address` VARCHAR(34) NOT NULL,
  `amount` DECIMAL(36, 18) NOT NULL,
  `fee` DECIMAL(24, 8) DEFAULT 0.00000000 NOT NULL,
  `status` ENUM('pending', 'confirmed', 'failed') DEFAULT 'pending' NOT NULL,
  `block_number` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`wallet_id`) REFERENCES `wallets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`token_id`) REFERENCES `tokens` (`id`) ON DELETE CASCADE,
  INDEX `idx_blockchain_tx_wallet` (`wallet_id`),
  INDEX `idx_blockchain_tx_hash` (`tx_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. TransactionHistory Table (Unified Ledger view of ALL client-side transaction logs)
CREATE TABLE IF NOT EXISTS `transaction_history` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `wallet_id` BIGINT UNSIGNED NOT NULL,
  `type` ENUM('blockchain', 'internal') NOT NULL,
  `direction` ENUM('in', 'out', 'self') NOT NULL,
  `asset_symbol` VARCHAR(20) NOT NULL,
  `amount` DECIMAL(36, 18) NOT NULL,
  `counterparty` VARCHAR(34) NOT NULL,
  `fee` DECIMAL(24, 8) DEFAULT 0.00000000 NOT NULL,
  `status` ENUM('pending', 'completed', 'failed') DEFAULT 'completed' NOT NULL,
  `tx_hash` VARCHAR(64) NULL,
  `internal_ledger_id` BIGINT UNSIGNED NULL,
  `blockchain_tx_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`wallet_id`) REFERENCES `wallets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`internal_ledger_id`) REFERENCES `internal_ledger` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`blockchain_tx_id`) REFERENCES `blockchain_transactions` (`id`) ON DELETE SET NULL,
  INDEX `idx_history_wallet` (`wallet_id`),
  INDEX `idx_history_type` (`type`),
  INDEX `idx_history_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Sessions Table (Stateful tracking of active user logins)
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `token` VARCHAR(255) NOT NULL UNIQUE,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_sessions_token` (`token`),
  INDEX `idx_sessions_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Notifications Table (Tracks alerts and wallet updates)
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `message` TEXT NOT NULL,
  `is_read` BOOLEAN DEFAULT FALSE NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_notifications_user` (`user_id`),
  INDEX `idx_notifications_unread` (`user_id`, `is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Admins Table (Backoffice Authentication)
CREATE TABLE IF NOT EXISTS `admins` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `password_hash` VARCHAR(60) NOT NULL COMMENT 'Bcrypt-hashed password',
  `role` ENUM('root', 'editor', 'viewer') DEFAULT 'editor' NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `idx_admins_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default master admin (password: Admin@TronNest123)
INSERT INTO `admins` (`id`, `username`, `password_hash`, `role`) VALUES
(1, 'admin_root', '$2b$12$fTz4K2o0eCOi7ncoQhV8D.hRz1A5pC56zQ7rJ1X5/V11S9jZlFz36', 'root')
ON DUPLICATE KEY UPDATE `username`=`username`;

-- 13. AdminLogs Table (Audit trails for administrative operations)
CREATE TABLE IF NOT EXISTS `admin_logs` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `admin_id` BIGINT UNSIGNED NOT NULL,
  `action` VARCHAR(255) NOT NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE,
  INDEX `idx_admin_logs_admin` (`admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. WalletLogs Table (Chronicle events specific to wallet life-cycle)
CREATE TABLE IF NOT EXISTS `wallet_logs` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `wallet_id` BIGINT UNSIGNED NOT NULL,
  `event` VARCHAR(255) NOT NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`wallet_id`) REFERENCES `wallets` (`id`) ON DELETE CASCADE,
  INDEX `idx_wallet_logs_wallet` (`wallet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Devices Table (Tracks connected app instances)
CREATE TABLE IF NOT EXISTS `devices` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `device_fingerprint` VARCHAR(255) NOT NULL UNIQUE,
  `os` VARCHAR(50) NOT NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `last_active` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_devices_user` (`user_id`),
  INDEX `idx_devices_fingerprint` (`device_fingerprint`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. AuditLogs Table (Comprehensive immutable security tracker)
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `actor_type` ENUM('user', 'admin', 'system') NOT NULL,
  `actor_id` BIGINT UNSIGNED NULL,
  `action` VARCHAR(150) NOT NULL,
  `details` JSON NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `idx_audit_logs_actor` (`actor_type`, `actor_id`),
  INDEX `idx_audit_logs_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. AppSettings Table (Global configuration options)
CREATE TABLE IF NOT EXISTS `app_settings` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `setting_key` VARCHAR(100) NOT NULL UNIQUE,
  `setting_value` TEXT NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed defaults for app settings
INSERT INTO `app_settings` (`setting_key`, `setting_value`) VALUES
('min_withdrawal_fee_trx', '2.0'),
('support_email', 'support@tronnest.com'),
('allow_internal_transfers', 'true')
ON DUPLICATE KEY UPDATE `setting_key`=`setting_key`;

-- 18. NetworkSettings Table (Configuration for current TRON network binding)
CREATE TABLE IF NOT EXISTS `network_settings` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `network_name` VARCHAR(50) NOT NULL UNIQUE COMMENT 'mainnet only',
  `full_node_url` VARCHAR(255) NOT NULL,
  `solidity_node_url` VARCHAR(255) NOT NULL,
  `event_server_url` VARCHAR(255) NOT NULL,
  `usdt_contract_address` VARCHAR(34) NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Mainnet network
INSERT INTO `network_settings` (`network_name`, `full_node_url`, `solidity_node_url`, `event_server_url`, `usdt_contract_address`) VALUES
('mainnet', 'https://api.trongrid.io', 'https://api.trongrid.io', 'https://api.trongrid.io', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
ON DUPLICATE KEY UPDATE `network_name`=`network_name`;

SET FOREIGN_KEY_CHECKS = 1;
