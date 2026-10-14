---
trigger: always_on
---

# Spare Parts POS — Project Rules

## What this is
A point-of-sale and inventory system for ONE retail vehicle spare parts shop in Sri Lanka.
Users: one owner and several cashiers. Currency: LKR. Time zone: Asia/Colombo.

## Stack (do not change without asking)
- Next.js App Router, TypeScript strict mode, Server Components by default
- PostgreSQL (local database: pos_dev), Drizzle ORM + drizzle-kit, `pg` driver
- Better Auth (email + password) with its Drizzle adapter
- Tailwind CSS + shadcn/ui, lucide-react icons
- Zod to validate every input that reaches the server
- Mutations via Server Actions; reads in Server Components

## Database rules (most important)
- The schema lives in src/db/. It is the single source of truth.
- Change the schema ONLY by editing schema files, then `npm run db:generate -- --name=<snake_case_description>`. Then STOP and show me the generated migration.sql before running `npm run db:migrate`.
- NEVER run `drizzle-kit push`. NEVER edit or delete a migration that has been applied. NEVER create or alter tables by hand in psql. NEVER drop pos_dev.
- Avoid column renames. drizzle-kit asks interactive rename questions that can hang the terminal. Add new columns instead, or ask me first.
- Enforce rules in the database, not only in the UI: NOT NULL, UNIQUE, CHECK, foreign keys. Name CHECK constraints <table>_<column>_check.
- Index every foreign key column. Postgres does not do this automatically.
- IDs: bigint identity with { mode: 'number' }. Better Auth tables keep their own text ids.
- Timestamps: timestamp(..., { withTimezone: true }). Store UTC. Display times and compute "today" in Asia/Colombo.
- Money: numeric(12,2) columns. Drizzle returns them as strings; keep it that way. Never do money math with JS floats: use decimal.js, or do it in SQL. Display as "Rs. 1,250.00".
- Never delete sales or stock history. Sales are voided (status column), not deleted. Products that have been sold are deactivated (is_active = false), not deleted.
- Every stock change writes a stock_movements row in the SAME transaction as the products.stock_qty change.
- Any operation that writes more than one row (checkout, void, stock adjustment) runs inside db.transaction(). Lock the product rows being changed with SELECT ... FOR UPDATE (Drizzle .for('update')), in ascending id order, before checking stock.
- Receipt numbers are NOT sales ids (ids have gaps). Generate them from a counter row updated inside the checkout transaction, so they are gap-free.
- Map Postgres error codes to friendly messages: 23505 unique, 23514 check, 23503 foreign key.
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