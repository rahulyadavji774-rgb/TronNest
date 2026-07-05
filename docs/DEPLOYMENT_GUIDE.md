# TronNest Deployment Guide

## Prerequisites
- Node.js v20+
- MariaDB Server
- Environment Variables setup

## Environment Variables
Create a `.env` file in the root directory:

```env
NODE_ENV=production
PORT=3000

# MariaDB Connection
DATABASE_URL=mysql://user:password@localhost:3306/tronnest

# Security Keys
JWT_SECRET=your_super_secret_jwt_key
ENCRYPTION_KEY=32_byte_hex_string_for_wallet_encryption
```

## Production Build

1. **Install Dependencies**
```bash
npm install
```

2. **Generate Database Migrations**
```bash
npx drizzle-kit generate
npx drizzle-kit push
```

3. **Build the Application**
```bash
npm run build
```
*This command bundles both the Vite frontend and the Express/Node backend into the `dist/` directory.*

## Running in Production

Start the compiled Node.js server:
```bash
npm start
```
*The server will serve both the backend API and the static frontend assets.*

## Health & Monitoring
- Access `/api/health` to verify server uptime.
- Check PM2 or Docker logs for central Winston logging outputs.
