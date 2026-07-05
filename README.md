# TronNest Project Documentation

## Overview
TronNest is an advanced, production-ready internal token wallet and admin management system. It provides secure wallets, token minting/burning capabilities, and an administrative dashboard for monitoring and managing user accounts and internal ledgers.

## Architecture
- **Frontend**: React 19, Vite, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: MariaDB via Drizzle ORM
- **Authentication**: JWT, bcrypt, Admin Roles
- **Security**: Helmet, Rate Limiting, CORS, Parameterized SQL queries

## Features
- **Wallet Engine**: Create, activate, freeze, and manage wallets.
- **Authentication Engine**: JWT-based auth with refresh tokens, multi-role admin support.
- **Internal Token Engine**: Unlimited custom internal tokens (mint, burn, freeze, lock supply).
- **Balance Engine**: Atomic double-entry ledger updates.
- **Admin Panel**: Dashboard for users, tokens, balances, transaction history, audit logs, and more.
