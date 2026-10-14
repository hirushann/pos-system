# AutoParts POS — Retail Spare Parts Point of Sale & Inventory System

A high-performance Point of Sale and Inventory Management system tailored for a retail vehicle spare parts shop in Sri Lanka.

- **Currency:** Sri Lankan Rupees (`Rs. 1,250.00` / LKR)
- **Time Zone:** `Asia/Colombo` (UTC+05:30)
- **Architecture:** Next.js App Router (TypeScript strict mode), PostgreSQL, Drizzle ORM, Better Auth, Tailwind CSS, shadcn/ui.

---

## Table of Contents
1. [Prerequisites & System Requirements](#prerequisites--system-requirements)
2. [Fresh Setup on a New Mac](#fresh-setup-on-a-new-mac)
3. [Environment Variables (.env.local)](#environment-variables-envlocal)
4. [Database Initialization & Migrations](#database-initialization--migrations)
5. [Creating the Store Owner](#creating-the-store-owner)
6. [Available npm Scripts](#available-npm-scripts)
7. [Running Tests](#running-tests)
8. [Database Backup & Restore](#database-backup--restore)
9. [Role Permissions & Security](#role-permissions--security)

---

## Prerequisites & System Requirements

Before setting up the application on a new Mac, ensure the following are installed:

- **macOS:** macOS Sonoma (14+) or macOS Sequoia (15+)
- **Node.js:** v20.x, v22.x, or v26.x (recommended via [nvm](https://github.com/nvm-sh/nvm) or Homebrew)
- **PostgreSQL:** Version 15 or 16
- **Homebrew:** (Package manager for macOS)

To install Node.js and PostgreSQL via Homebrew:
```bash
# Install PostgreSQL
brew install postgresql@16
brew services start postgresql@16

# Install Node.js
brew install node
```

---

## Fresh Setup on a New Mac

### 1. Clone & Enter Project Directory
```bash
git clone <repository-url> pos-system
cd pos-system
```

### 2. Install Project Dependencies
```bash
npm install
```

### 3. Create PostgreSQL Databases
Create the development and test databases:
```bash
createdb pos_dev
createdb pos_test
```

### 4. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Generate a secure secret for Better Auth:
```bash
openssl rand -hex 32
```

Populate `.env.local` (see [Environment Variables](#environment-variables-envlocal)).

---

## Environment Variables (.env.local)

The application loads environment variables from `.env.local` (which is never committed to Git):

```ini
# Primary development PostgreSQL database
DATABASE_URL=postgresql://localhost:5432/pos_dev

# Dedicated test database (never touches pos_dev)
DATABASE_URL_TEST=postgresql://localhost:5432/pos_test

# Secret used to encrypt sessions and cookies (generate with openssl rand -hex 32)
BETTER_AUTH_SECRET=your_generated_32_byte_hex_secret

# Root URL for auth callbacks
BETTER_AUTH_URL=http://localhost:3000
```

---

## Database Initialization & Migrations

The database schema lives in `src/db/schema.ts` and is the single source of truth.

### 1. Run Applied Migrations
Apply all schema migrations to your local development database (`pos_dev`):
```bash
npm run db:migrate
```

### 2. (Optional) Seed Sample Spare Parts Catalog
Populate categories (Brakes, Engine, Suspension, Filters, Oils & Fluids), brands, vehicle fitments (Toyota Axio, Premio, HiAce, Suzuki Alto), and initial inventory:
```bash
npm run db:seed
```

---

## Creating the Store Owner

The POS enforces strict role boundaries: cashiers cannot create accounts or access administrative settings. Only the store owner can provision cashier credentials.

Provision the initial store owner account:
```bash
npm run create-owner
```
*Follow the interactive prompt to set the owner's name, email, and password (e.g. `owner@autospares.lk` / `Owner123!`).*

---

## Available npm Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `next dev` | Starts local Next.js development server on `http://localhost:3000`. |
| `npm run build` | `next build` | Compiles optimized production bundle. |
| `npm run start` | `next start` | Runs the production build server. |
| `npm run lint` | `eslint` | Runs ESLint across all TypeScript and React files. |
| `npm test` | `vitest run` | Runs test suite against `pos_test` (safeguarded against touching `pos_dev`). |
| `npm run db:migrate` | `drizzle-kit migrate` | Applies pending Drizzle migrations to `pos_dev`. |
| `npm run db:generate` | `drizzle-kit generate` | Generates a new migration from schema changes (`-- --name=<name>`). |
| `npm run db:studio` | `drizzle-kit studio` | Launches Drizzle Studio in browser for inspecting data. |
| `npm run db:seed` | `tsx --env-file=.env.local src/db/seed.ts` | Seeds categories, vehicle models, parts, and stock. |
| `npm run db:backup` | `bash scripts/backup.sh` | Takes an automated `pg_dump -Fc` backup in `backups/`, keeping the last 30. |
| `npm run create-owner`| `tsx --env-file=.env.local src/scripts/create-owner.ts` | Creates initial store owner account. |

---

## Running Tests

All automated tests run via Vitest against the dedicated `pos_test` database:

```bash
npm test
```

### Test Coverage Highlights:
- **`completeSale` Happy Path:** Verifies stock decrements, line item pricing, payment split, and synchronous `stock_movements` ledger insertion within a single database transaction.
- **Atomic Rollback on Insufficient Stock:** Confirms that attempting to sell items exceeding stock on hand aborts the transaction cleanly, leaving stock, sales, and movements untouched.
- **Row-Lock Concurrency (`SELECT ... FOR UPDATE`):** Tests two simultaneous checkout attempts for the last remaining unit; verifies that exactly one transaction succeeds and the other fails without negative stock or deadlocks.
- **Gap-Free Receipt Numbering:** Confirms receipt numbers remain strictly sequential even if a preceding transaction fails.
- **Void Transaction Stock Restoration:** Confirms that voiding a sale updates sale status, logs the void reason, restores stock, and writes a void `stock_movements` entry.
- **Role Enforcement:** Confirms cashiers are strictly blocked from voiding sales or adjusting inventory.

---

## Database Backup & Restore

### Taking a Backup
The backup script performs a custom-format dump (`pg_dump -Fc`) of PostgreSQL into the `backups/` directory and automatically retains only the most recent 30 backup files:

```bash
npm run db:backup
# or directly:
bash scripts/backup.sh
```

Backups are saved as `backups/pos_backup_YYYYMMDD_HHMMSS.dump` (ignored by `.gitignore`).

### Restoring from a Backup
To restore a backup into `pos_dev` using `pg_restore`:

```bash
# Restore into existing pos_dev database (cleans existing tables before recreating):
pg_restore -d pos_dev --clean --if-exists backups/pos_backup_<timestamp>.dump

# Or restore into a fresh database:
createdb pos_dev_restored
pg_restore -d pos_dev_restored backups/pos_backup_<timestamp>.dump
```

---

## Role Permissions & Security

| Action / Resource | Store Owner | Cashier |
| :--- | :---: | :---: |
| Point of Sale Checkout (`/checkout`) | Yes | Yes |
| Barcode & Part Number Search | Yes | Yes |
| View Stock on Hand | Yes | Yes |
| View Own Completed Sales (`/sales`) | Yes | Yes (Today only) |
| View All Historical Sales & Reprints | Yes | No |
| Cost Prices & Profit Margins | Yes | Hidden |
| Void Completed Sales | Yes (Reason required) | Forbidden |
| Manual Stock Adjustments (`/inventory`) | Yes | Forbidden |
| Product Catalog Management (`/products`) | Yes | Forbidden |
| Financial Reports & CSV Export (`/reports`) | Yes | Forbidden (Redirected) |
| Store Settings (`/settings`) | Yes | Forbidden |
| Staff Account Provisioning (`/users`) | Yes | Forbidden |
