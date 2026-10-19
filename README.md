# Jayaweera Logistic & Motors POS — Point of Sale & Inventory System

A high-performance Point of Sale and Inventory Management system tailored for a retail vehicle spare parts shop in Sri Lanka.

- **Currency:** Sri Lankan Rupees (`Rs. 1,250.00` / LKR)
- **Time Zone:** `Asia/Colombo` (UTC+05:30)
- **Architecture:** Next.js App Router (TypeScript strict mode), MySQL, Drizzle ORM, Better Auth, Tailwind CSS, shadcn/ui.

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
- **MySQL:** Version 8.0 or newer (MariaDB 10.5+ also works)
- **Homebrew:** (Package manager for macOS)

To install Node.js and MySQL via Homebrew:
```bash
# Install MySQL
brew install mysql
brew services start mysql

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

### 3. Create MySQL Databases
Create the development and test databases (utf8mb4 so all characters are stored correctly):
```bash
mysql -u root -p -e "CREATE DATABASE pos_dev CHARACTER SET utf8mb4; CREATE DATABASE pos_test CHARACTER SET utf8mb4;"
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
# Primary development MySQL database (format: mysql://user:password@host:3306/database)
DATABASE_URL=mysql://root:your_password@localhost:3306/pos_dev

# Dedicated test database (never touches pos_dev)
DATABASE_URL_TEST=mysql://root:your_password@localhost:3306/pos_test

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
npm run create-owner -- --email owner@example.com --name "Owner Name"
```
*The script prints a generated password once: copy it when it appears. Run it again with the same email to reset that password.*

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
| `npm run db:backup` | `bash scripts/backup.sh` | Takes an automated `mysqldump` backup (gzipped) in `backups/`, keeping the last 30. |
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
The backup script runs `mysqldump --single-transaction` (a consistent snapshot, no table locks) into the `backups/` directory, gzips it, and automatically retains only the most recent 30 backup files. It needs the `mysqldump` client on the machine:

```bash
npm run db:backup
# or directly:
bash scripts/backup.sh
```

Backups are saved as `backups/pos_backup_YYYYMMDD_HHMMSS.sql.gz` (ignored by `.gitignore`).

### Restoring from a Backup
To restore a backup into `pos_dev`:

```bash
# Restore into an existing (empty or disposable) pos_dev database:
gunzip -c backups/pos_backup_<timestamp>.sql.gz | mysql -u root -p pos_dev

# Or restore into a fresh database:
mysql -u root -p -e "CREATE DATABASE pos_dev_restored CHARACTER SET utf8mb4"
gunzip -c backups/pos_backup_<timestamp>.sql.gz | mysql -u root -p pos_dev_restored
```

---

## Printing on the Epson LQ-310 (fan-fold, 9.5 x 5.5 in)

There are two ways to print an invoice:

1. **Straight from the browser (default).** **Print Invoice** opens `/sales/<id>/invoice`, a
   layout that is exactly **241.3 x 139.7 mm** (9.5 x 5.5 in) per form with zero page margin,
   so no browser header/footer and no scaling. In the print dialog choose the 9.5 x 5.5 in
   paper (on a Mac, add it under Paper Size > Manage Custom Sizes), Scale 100%, highest printer
   quality. Up to about 9 items fit on a form; longer invoices continue on the next form.
2. **Plain text with the printer's own fonts (sharper).** See below; needs the print agent.


The plain-text route prints the invoice with **the printer's own built-in fonts**, which is
much sharper than printing a web page as a picture. The POS builds the invoice as text plus
ESC/P printer commands (`src/lib/escp-invoice.ts`). A small helper, the **print agent**
(`scripts/print-agent.mjs`), runs on the computer the printer is plugged into and passes
those bytes straight to the printer.

Each invoice is one 5.5 in form (33 lines, about 14 items); longer invoices continue on the
next form with the headings repeated. The page at `/sales/<id>/text-invoice` shows exactly
what will print.

### One-time setup (on the Mac the printer is connected to)

1. Add the LQ-310 in **System Settings > Printers & Scanners** (USB) so macOS knows it.
2. Find its device address and create a raw queue (a queue that sends data unchanged):
   ```bash
   lpstat -v                      # note the device URI of the LQ-310, e.g. usb://EPSON/LQ-310?serial=...
   sudo lpadmin -p LQ310_RAW -E -v "PASTE-THE-DEVICE-URI-HERE" -m raw
   ```
3. Test that the printer's own fonts work (it should print "Hello" and eject the form):
   ```bash
   printf '\033@\033x1Hello from the LQ-310\r\n\f' | lp -d LQ310_RAW -o raw
   ```
4. Start the print agent (keep this Terminal window open while you work):
   ```bash
   cd pos-system
   PRINTER_QUEUE=LQ310_RAW ALLOWED_ORIGINS=https://pos.dayzsolutions.com npm run print-agent
   ```
   `ALLOWED_ORIGINS` is the address of your POS website (comma-separate several). The agent
   only accepts print jobs from those sites and only listens on this computer.

Then, after a sale, **Print Invoice** opens the text invoice and prints it automatically.
Use **Chrome**: it asks once for permission to talk to the local print agent (allow it).
Safari blocks websites from talking to local programs, so use **Download .prn** there and
print the file with `lp -d LQ310_RAW -o raw INV-....prn`.

### Loading the paper

Fit the fan-fold on the tractors and align the top of a form with the print head
(tear-off position). Each invoice starts one line below the top of the form and ends with a
form feed, so the next form lines up on its own.

### Adjusting the layout

Defaults live in `TEXT_INVOICE_DEFAULTS` in `src/lib/escp-invoice.ts`:

| Setting | Default | Meaning |
| :--- | :--- | :--- |
| `typeface` | `1` | Built-in font: 0 Roman, 1 Sans Serif, 2 Courier, 3 Prestige |
| `cols` | `92` | Characters per line at 12 cpi (the LQ-310 prints up to 96 / 8.0 in) |
| `leftMargin` | `0` | Columns to shift everything right if the text sits too close to the tractor holes |
| `doubleStrike` | `false` | Print each line twice for a darker carbon copy |
| `formLines` / `usableLines` | `33` / `31` | Lines per 5.5 in form / lines of content per form |

The graphics invoice (`/sales/<id>/invoice`) is still available as a fallback from the
text invoice page.

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
