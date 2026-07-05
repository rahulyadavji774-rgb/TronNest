# TronNest Database Documentation

## Technology Stack
- **Database**: MariaDB
- **ORM**: Drizzle ORM
- **Migration & Schema**: drizzle-kit

## Tables & Relationships

### `users`
End-users of the system.
- `id` (UUID, Primary Key)
- `username` (Unique)
- `password_hash` (bcrypt)
- `status` (active, suspended)

### `wallets`
Wallets linked to users.
- `id` (UUID, Primary Key)
- `user_id` (Foreign Key -> users)
- `address` (Unique string)
- `is_locked`, `is_frozen`

### `wallet_keys`
Secure key storage (encrypted).
- `wallet_id` (Foreign Key -> wallets)
- `public_key`
- `encrypted_private_key`

### `tokens`
Internal and blockchain tokens.
- `id` (UUID, Primary Key)
- `symbol`, `name`, `decimals`
- `total_supply`, `circulating_supply`
- `is_internal`
- `supply_locked`

### `balances`
Wallet token balances.
- `id` (UUID, Primary Key)
- `wallet_id` (Foreign Key -> wallets)
- `token_id` (Foreign Key -> tokens)
- `balance` (Decimal 36,18)

### `transactions` & `transaction_logs`
Double-entry ledger records.
- Track transfers, mints, and burns.
- Guarantee atomic operations.
- `from_wallet_id`, `to_wallet_id`, `token_id`, `amount`, `type`, `status`.

### `admins`
System administrators.
- `role` (viewer, editor, root)

### `audit_logs`
Tracks all sensitive operations.
- `actor_id`, `actor_type`, `action`, `details`.

## Optimizations
- **UUID Primary Keys** for all tables.
- **Indexes** added on high-query columns (e.g., `user_id`, `wallet_id`, `token_id`).
- **Rollback Protection** using database transactions for balance updates.
