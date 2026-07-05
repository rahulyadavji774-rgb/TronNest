# TronNest API Documentation

## Base URL
`/api`

## Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/login` - User login
- `POST /api/auth/admin/login` - Admin login
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/logout` - Logout session

### Admin (`/api/admin`)
**Requires Admin Token**

- `GET /api/admin/users` - List all users
- `POST /api/admin/users/freeze` - Freeze a user's wallet
- `GET /api/admin/tokens` - List all internal tokens
- `POST /api/admin/tokens/mint` - Mint tokens for a user wallet (Requires 'root' role)
- `POST /api/admin/tokens/deduct` - Deduct tokens from a user wallet (Requires 'root' role)
- `GET /api/admin/ledger` - View transaction history
- `GET /api/admin/logs` - View system audit logs
- `GET /api/admin/settings` - View system settings (Requires 'root' role)
- `POST /api/admin/settings` - Update system settings (Requires 'root' role)

### Wallet (`/api/wallet`)
**Requires User Token**

- `GET /api/wallet/info` - Get wallet details and balances
- `POST /api/wallet/transfer` - Transfer internal tokens to another user
- `GET /api/wallet/history` - Get user transaction history

## Security & Validation
- **Rate Limiting**: Applied to all routes. Stricter on auth routes.
- **Data Validation**: Inputs validated via Express Validator.
- **Authorization**: Bearer token (JWT) required.
