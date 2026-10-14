---
trigger: always_on
---

# Spare Parts POS — Project Rules

## What this is
A point-of-sale and inventory system for ONE retail vehicle spare parts shop in Sri Lanka.
Users: one owner and several cashiers. Currency: LKR. Time zone: Asia/Colombo.

## Stack (do not change without asking)
- Next.js App Router, TypeScript strict mode, Server Components by default
- MySQL 8 (local database: pos_dev), Drizzle ORM + drizzle-kit, `mysql2` driver (migrated from PostgreSQL)
- Better Auth (email + password) with its Drizzle adapter
- Tailwind CSS + shadcn/ui, lucide-react icons
- Zod to validate every input that reaches the server
- Mutations via Server Actions; reads in Server Components

## Database rules (most important)
- The schema lives in src/db/. It is the single source of truth.
- Change the schema ONLY by editing schema files, then `npm run db:generate -- --name=<snake_case_description>`. Then STOP and show me the generated migration.sql before running `npm run db:migrate`.
- NEVER run `drizzle-kit push`. NEVER edit or delete a migration that has been applied. NEVER create or alter tables by hand in the mysql client. NEVER drop pos_dev.
- Avoid column renames. drizzle-kit asks interactive rename questions that can hang the terminal. Add new columns instead, or ask me first.
- Enforce rules in the database, not only in the UI: NOT NULL, UNIQUE, CHECK, foreign keys. Name CHECK constraints <table>_<column>_check.
- Index every foreign key column. (InnoDB creates an index for each foreign key automatically; add one yourself only for multi-column lookups.)
- IDs: bigint AUTO_INCREMENT with { mode: 'number' }. Better Auth tables keep their own text ids.
- Timestamps: use the `ts()` helper in src/db/columns.ts (DATETIME(3), stored as UTC; the connection sets time_zone = '+00:00'). Display times and compute "today" in Asia/Colombo.
- Money: decimal(12,2) columns. Drizzle returns them as strings; keep it that way. Never do money math with JS floats: use decimal.js, or do it in SQL. Display as "Rs. 1,250.00".
- Never delete sales or stock history. Sales are voided (status column), not deleted. Products that have been sold are deactivated (is_active = false), not deleted.
- Every stock change writes a stock_movements row in the SAME transaction as the products.stock_qty change.
- Any operation that writes more than one row (checkout, void, stock adjustment) runs inside db.transaction(). Lock the product rows being changed with SELECT ... FOR UPDATE (Drizzle .for('update')), in ascending id order, before checking stock.
- Receipt numbers are NOT sales ids (ids have gaps). Generate them from a counter row updated inside the checkout transaction, so they are gap-free.
- Map MySQL errors to friendly messages with `getDbErrorKind()` in src/lib/db-errors.ts: ER_DUP_ENTRY (1062) unique, ER_CHECK_CONSTRAINT_VIOLATED (3819) check, ER_NO_REFERENCED_ROW_2 (1452) foreign key.
- MySQL has no RETURNING or partial indexes: use `.$returningId()` after inserts, and the generated `internal_product_id` column (UNIQUE) to keep one internal barcode per product.
- Barcodes live in product_barcodes (code UNIQUE). Every product has exactly one internal code ('20' + id padded to 8 digits); manufacturer codes are extra rows. Scans look up by exact code only.

## Security and roles
- Roles: owner, cashier. No public sign-up. Only the owner creates cashier accounts.
- Check the session AND the role inside every Server Action and every protected page. Hiding a button is not security.
- Cashiers CAN: sell, search parts, view stock, view their own sales.
- Cashiers CANNOT: see cost prices or profit, edit products or prices, adjust stock, void sales, manage users, change settings, view reports.
- Secrets only in .env.local, never committed, never logged.

## UI rules
- Clean, modern UI with shadcn/ui. One font family throughout (set once in the root layout), consistent type sizes. Light and dark mode.
- Checkout must be fast by keyboard: search autofocused, Enter adds the highlighted part, shortcuts shown on screen. A USB barcode scanner (types the code + Enter) must work in the search box without changes.
- Every list has loading, empty and error states. Long tables are paginated on the server.
- Money is right-aligned with tabular numbers.

## How to work
- Before coding, give a short plan: files to create or change, and any schema change.
- Stay inside the current task. Don't refactor unrelated code.
- Before saying you're done, run `npm run lint` and `npx tsc --noEmit` and fix every error.
- Finish with: what changed, the new migration name (if any), and how I can test it by hand.
- If these rules block the task, stop and ask. Don't work around them.