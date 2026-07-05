# TronNest - Termux Installation Guide

TronNest is a production-ready Web3 wallet management application built with Node.js, React, and MariaDB.

Follow these instructions to install and run TronNest on an Android device using Termux.

## Prerequisites

1. Install **Termux** from F-Droid (do not use the Google Play version, it is deprecated).
2. Open Termux and update packages:
   ```bash
   pkg update && pkg upgrade -y
   ```

## 1. Install Dependencies

Install Node.js, Git, and MariaDB:
```bash
pkg install nodejs git mariadb -y
```

## 2. Set Up MariaDB Database

Start the MariaDB server in the background:
```bash
mysqld_safe &
```
*(Wait a few seconds for it to start)*

Run the secure installation (optional but recommended):
```bash
mariadb-secure-installation
```
*(You can just press Enter for most prompts if you want default local security)*

Initialize the TronNest database and user. You can use the provided `setup_database.sql` script:
```bash
mariadb -u root < setup_database.sql
```

## 3. Clone and Setup the Project

If you haven't already, clone the project or transfer the files to your Termux storage.

Navigate into the project directory:
```bash
cd tronnest
```

Install npm dependencies:
```bash
npm install
```

## 4. Configure Environment Variables

Create a `.env` file based on the example:
```bash
cp .env.example .env
```

Edit the `.env` file to configure your database connection (the default in `setup_database.sql` is `tronnest_user` with password `tronnest_password`):
```bash
nano .env
```
Ensure it has:
```
DATABASE_URL="mysql://tronnest_user:tronnest_password@localhost:3306/tronnest"
JWT_SECRET="YOUR_SUPER_SECRET_KEY"
```
*(Press `Ctrl+X`, then `Y`, then `Enter` to save and exit nano).*

## 5. Build the Project

Build the full-stack application (frontend SPA + backend Express server):
```bash
npm run build
```

## 6. Run the Application

Start the production server:
```bash
npm start
```

The database migrations will run automatically on the first startup.
TronNest will now be available on your device at:
**http://localhost:3000**

You can access it from your Android browser.

## Troubleshooting

- **Database Connection Refused**: Ensure MariaDB is running (`mysqld_safe &`).
- **Port 3000 in use**: Ensure no other server is running on port 3000, or modify the server port if needed.
- **Node errors**: Ensure you are using a recent version of Node.js (`node -v`).
