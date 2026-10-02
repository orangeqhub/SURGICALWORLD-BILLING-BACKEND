# Surgical World Billing — Backend API

Express + TypeScript + PostgreSQL + Sequelize REST API backing the existing Expo
frontend in `../frontend`.

> **Status: All phases complete.** Authentication/authorization, Products,
> Stock, Billing (invoices + payments + transactional stock deduction), Stock
> Transfers, Ledger (manual entries + party balances), Purchases (supplier
> stock receipt, server-authoritative GST calculations, atomic stock + ledger
> updates), Customers, Suppliers, Employees, CRM (notes + follow-ups),
> Attendance, Payroll, Sales Targets, Expenses, Receipts, Supplier Payments,
> Reports, and Settings are all implemented.

---

## Quick start

```bash
# 1. PostgreSQL must be running
Get-Service postgresql-x64-18          # Windows
sudo systemctl start postgresql        # Linux/macOS

# 2. Install and configure
npm install
cp .env.example .env                   # then fill in DB_PASSWORD and JWT_SECRET

# 3. Create the database (once)
psql -U postgres -c "CREATE DATABASE surgical_world;"
psql -U postgres -c "CREATE DATABASE surgical_world_test;"

# 4. Create the schema and demo data
npm run db:migrate
npm run db:seed

# 5. Run it
npm run dev
```

Verify:

```bash
curl http://localhost:5000/api/health
# {"success":true,"message":"Surgical World Billing API is running"}
```

### Seeded accounts

| loginId | Role           | Branch      | Password       |
| ------- | -------------- | ----------- | -------------- |
| `SA-001` | `SUPER_ADMIN`  | *(global)*  | `ChangeMe@123` |
| `BA-001` | `BRANCH_ADMIN` | `BR-001`    | `ChangeMe@123` |
| `EMP-001`| `EMPLOYEE`     | `BR-001`    | `ChangeMe@123` |

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"loginId":"BA-001","password":"ChangeMe@123"}'
```

> Change these immediately outside local development — they are read from
> `SEED_*` variables and the defaults are intentionally obvious.

---

## Scripts

| Command                 | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | Watch-mode server (tsx)                              |
| `npm run build`         | Compile TypeScript to `dist/`                        |
| `npm start`             | Run the compiled build                               |
| `npm run typecheck`     | Type-check only                                      |
| `npm run lint`          | Alias of `typecheck`                                 |
| `npm test`              | Full suite (unit + integration)                      |
| `npm run test:unit`     | Unit tests only                                      |
| `npm run test:integration` | Integration tests only                            |
| `npm run db:migrate`    | Apply pending migrations                             |
| `npm run db:migrate:status` | Show applied / pending migrations               |
| `npm run db:rollback`   | Revert the last migration                            |
| `npm run db:seed`       | Idempotent demo data                                 |
| `npm run db:reset`      | Rollback + re-apply + re-seed                        |

---

## Environment variables

| Variable                  | Required | Default                 | Notes                                    |
| ------------------------- | -------- | ----------------------- | ---------------------------------------- |
| `PORT`                    | no       | `5000`                  |                                          |
| `NODE_ENV`                | no       | `development`           | `production` enables strict secret checks |
| `DB_HOST`                 | no       | `localhost`             |                                          |
| `DB_PORT`                 | no       | `5432`                  |                                          |
| `DB_NAME`                 | no       | `surgical_world`        |                                          |
| `DB_NAME_TEST`            | no       | `surgical_world_test`   | Used by `npm test`                       |
| `DB_USER`                 | no       | `postgres`              |                                          |
| `DB_PASSWORD`             | **yes**  | —                       |                                          |
| `DB_LOGGING`              | no       | `false`                 | Logs every SQL statement                 |
| `JWT_SECRET`              | **yes**  | dev-only fallback       | **No dev fallback in production**        |
| `JWT_EXPIRES_IN`          | no       | `7d`                    |                                          |
| `BCRYPT_SALT_ROUNDS`      | no       | `10`                    |                                          |
| `LOGIN_RATE_LIMIT`        | no       | `10`                    | Failed logins per IP / 15 min           |
| `CORS_ORIGIN`             | no       | *(dev: allow all)*      | Comma-separated. Never `*` in production |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## API

All routes are prefixed `/api`. Responses use a consistent envelope:

```jsonc
// success
{ "success": true, "data": { } }

// success without a payload (health)
{ "success": true, "message": "..." }

// failure
{ "success": false, "error": { "code": "FORBIDDEN", "message": "..." } }
```

### Public

| Method | Path                | Description                            |
| ------ | ------------------- | -------------------------------------- |
| `GET`  | `/api/health`       | Liveness. No DB access.                |
| `GET`  | `/api/health/ready` | Readiness. Verifies the database.      |
| `POST` | `/api/auth/login`   | `{ loginId, password, branchId? }` → `{ token, user }` |

### Authenticated

| Method   | Path                                            | Roles                              |
| -------- | ----------------------------------------------- | ---------------------------------- |
| `GET`    | `/api/auth/me`                                  | any                                |
| `POST`   | `/api/auth/change-password`                     | any (own password only)            |
| `GET`    | `/api/auth/users`                               | any (branch-scoped)                |
| `POST`   | `/api/auth/users`                               | `SUPER_ADMIN`                      |
| `PUT`    | `/api/auth/users/:id/status`                    | `SUPER_ADMIN`, `BRANCH_ADMIN`      |
| `GET`    | `/api/branches`                                 | any (Super Admin sees all)         |
| `GET`    | `/api/branches/:branchId`                       | any (own branch, or Super Admin)   |
| `POST`   | `/api/branches`                                 | `SUPER_ADMIN`                      |
| `PUT`    | `/api/branches/:branchId`                       | `SUPER_ADMIN`                      |
| `GET`    | `/api/products`                                 | any                                |
| `GET`    | `/api/products/search`                          | any                                |
| `GET`    | `/api/products/barcode/:barcode`                | any                                |
| `GET`    | `/api/products/:id`                             | any                                |
| `POST`   | `/api/products`                                 | `PRODUCT_MASTER` permission        |
| `PUT`    | `/api/products/:id`                             | `PRODUCT_MASTER` permission        |
| `PATCH`  | `/api/products/:id/status`                      | `PRODUCT_MASTER` permission        |
| `DELETE` | `/api/products/:id`                             | `PRODUCT_MASTER` permission        |
| `GET`    | `/api/branches/:branchId/inventory`             | any (own branch)                   |
| `GET`    | `/api/branches/:branchId/stock`                 | any (own branch)                   |
| `GET`    | `/api/branches/:branchId/stock/:productId`      | any (own branch)                   |
| `POST`   | `/api/branches/:branchId/stock-adjust`          | `STOCK_ADJUST` permission          |
| `GET`    | `/api/branches/:branchId/stock-movements`       | any (own branch)                   |
| `POST`   | `/api/invoices`                                 | `BILLING` permission               |
| `GET`    | `/api/invoices`                                 | any (branch-scoped)                |
| `GET`    | `/api/invoices/:id`                             | any (own branch)                   |
| `POST`   | `/api/stock-transfers`                          | `TRANSFER_CREATE` permission       |
| `GET`    | `/api/stock-transfers`                          | `TRANSFER_VIEW` (branch-scoped)    |
| `GET`    | `/api/stock-transfers/:id`                      | `TRANSFER_VIEW` (own branch)       |
| `PATCH`  | `/api/stock-transfers/:id/submit`               | `TRANSFER_CREATE`                  |
| `PATCH`  | `/api/stock-transfers/:id/approve`              | `SUPER_ADMIN` only                 |
| `PATCH`  | `/api/stock-transfers/:id/reject`               | `SUPER_ADMIN` only                 |
| `PATCH`  | `/api/stock-transfers/:id/dispatch`             | `TRANSFER_DISPATCH`                |
| `PATCH`  | `/api/stock-transfers/:id/receive`              | `TRANSFER_RECEIVE`                 |
| `PATCH`  | `/api/stock-transfers/:id/cancel`               | `TRANSFER_CREATE`                  |
| `POST`   | `/api/ledger`                                   | `SUPER_ADMIN`, `BRANCH_ADMIN`      |
| `GET`    | `/api/ledger`                                   | any (branch-scoped for BA/EMP)     |
| `GET`    | `/api/ledger/balance`                           | any authenticated                  |
| `POST`   | `/api/purchases`                                | `PURCHASE_MANAGE` permission       |
| `GET`    | `/api/branches/:branchId/purchases`             | any (own branch)                   |
| `GET`    | `/api/purchases/:id/items`                      | any (own branch; id or localId)    |
| `GET`    | `/api/customers`                                | any (branch-scoped)                |
| `GET`    | `/api/branches/:branchId/customers`             | any (own branch)                   |
| `GET`    | `/api/customers/search?q=`                      | any (branch-scoped)                |
| `POST`   | `/api/customers`                                | any authenticated                  |
| `PUT`    | `/api/customers/:id`                            | any authenticated (own branch)     |
| `GET`    | `/api/suppliers`                                | any (branch-scoped)                |
| `GET`    | `/api/branches/:branchId/suppliers`             | any (own branch)                   |
| `POST`   | `/api/suppliers`                                | `SUPPLIER_MANAGE` permission       |
| `PUT`    | `/api/suppliers/:id`                            | `SUPPLIER_MANAGE` permission       |
| `GET`    | `/api/employees`                                | any (branch-scoped)                |
| `GET`    | `/api/branches/:branchId/employees`             | any (own branch)                   |
| `POST`   | `/api/employees`                                | `SUPER_ADMIN`, `BRANCH_ADMIN`      |
| `PUT`    | `/api/employees/:id/status`                     | `SUPER_ADMIN`, `BRANCH_ADMIN`      |
| `GET`    | `/api/branch-admins`                            | any (branch-scoped)                |
| `GET`    | `/api/customers/:id/notes`                      | any (own branch)                   |
| `POST`   | `/api/customers/:id/notes`                      | `CRM_MANAGE` permission            |
| `GET`    | `/api/crm/follow-ups`                           | any (branch-scoped)                |
| `GET`    | `/api/crm/follow-ups/counts`                    | any (branch-scoped)                |
| `POST`   | `/api/crm/follow-ups`                           | `CRM_MANAGE` permission            |
| `PUT`    | `/api/crm/follow-ups/:id`                       | `CRM_MANAGE` permission            |
| `PUT`    | `/api/crm/follow-ups/:id/complete`              | `CRM_MANAGE` permission            |
| `PUT`    | `/api/crm/follow-ups/:id/cancel`                | `CRM_MANAGE` permission            |
| `PUT`    | `/api/crm/follow-ups/:id/reschedule`            | `CRM_MANAGE` permission            |
| `GET`    | `/api/attendance`                               | any (branch-scoped)                |
| `GET`    | `/api/attendance/today`                         | any (own record)                   |
| `GET`    | `/api/attendance/summary`                       | any (own record)                   |
| `POST`   | `/api/attendance/check-in`                      | any authenticated                  |
| `POST`   | `/api/attendance/check-out`                     | any authenticated                  |
| `POST`   | `/api/attendance/manual`                        | `ATTENDANCE_MANAGE` permission     |
| `GET`    | `/api/payroll`                                  | any (branch-scoped)                |
| `GET`    | `/api/payroll/:employeeId/:month`               | any (own record)                   |
| `POST`   | `/api/payroll/generate`                         | `PAYROLL_MANAGE` permission        |
| `PUT`    | `/api/payroll/:id`                              | `PAYROLL_MANAGE` permission        |
| `PUT`    | `/api/payroll/:id/mark-paid`                    | `PAYROLL_MANAGE` permission        |
| `GET`    | `/api/sales-targets`                            | any (branch-scoped)                |
| `POST`   | `/api/sales-targets`                            | `TARGET_MANAGE` permission         |
| `PUT`    | `/api/sales-targets/:id`                        | `TARGET_MANAGE` permission         |
| `PUT`    | `/api/sales-targets/:id/cancel`                 | `TARGET_MANAGE` permission         |
| `GET`    | `/api/branches/:branchId/expenses`              | any (own branch)                   |
| `POST`   | `/api/expenses`                                 | `EXPENSE_MANAGE` permission        |
| `GET`    | `/api/branches/:branchId/receipts`              | any (own branch)                   |
| `POST`   | `/api/receipts`                                 | `RECEIPTS_MANAGE` permission       |
| `GET`    | `/api/branches/:branchId/payments`              | any (own branch)                   |
| `POST`   | `/api/payments`                                 | `PAYMENTS_MANAGE` permission       |
| `PUT`    | `/api/settings/:key`                            | `SUPER_ADMIN`, `BRANCH_ADMIN`      |
| `GET`    | `/api/reports/sales-trend`                      | `REPORTS_VIEW` permission          |
| `GET`    | `/api/reports/branch-sales`                     | `REPORTS_VIEW` permission          |
| `GET`    | `/api/reports/payment-split`                    | `REPORTS_VIEW` permission          |
| `GET`    | `/api/reports/product-sales`                    | `REPORTS_VIEW` permission          |
| `GET`    | `/api/reports/customer-sales`                   | `REPORTS_VIEW` permission          |
| `GET`    | `/api/reports/purchase-product-breakdown`       | `REPORTS_VIEW` permission          |

---

## Security model

- **Passwords** — bcrypt (via `bcryptjs`), 10 rounds. Hashes are stripped from
  every serialized response.
- **JWT** — HS256, verified for issuer, audience, and expiry on every request.
  The user row is **reloaded from the database** on each request, so a
  deactivated account or a role/branch change takes effect immediately instead
  of waiting for token expiry.
- **Account enumeration** — an unknown `loginId` and a wrong password return the
  identical `401` body, and the miss path performs a dummy hash comparison so
  response time does not leak existence.
- **Rate limiting** — failed logins are throttled per IP
  (`LOGIN_RATE_LIMIT`); successful logins do not count.
- **Branch isolation** — `BRANCH_ADMIN` and `EMPLOYEE` are confined to their own
  branch. `SUPER_ADMIN` is global and has `branchId = NULL`.
- **Branch-id conflicts are rejected, never normalised** — every explicit
  `branchId` in the route params, body, *and* query string is collected and
  compared. A request such as `GET /branches/<own>?branchId=<other>` is a
  `400`, so a matching route param can never mask a conflicting body value.
- **Authoritative branch** — services call `authoritativeBranchId(req)`, which
  ignores client input for branch-scoped accounts. Audit fields (`createdBy`,
  `requestedBy`, `approvedBy`) always come from the JWT, never the request body.
- **Validation** — Zod schemas strip unknown fields and reject bad types before
  any handler runs.
- **Hardening** — Helmet, explicit CORS allow-list (never wildcarded in
  production), 1 MB body cap, disabled `x-powered-by`, graceful shutdown.
- **Database** — `ON DELETE RESTRICT` on audit-critical relations so financial
  history can never be silently cascaded away.

---

## Data model notes

### Money

Every monetary column is `DECIMAL(14,2)`; every percentage is `DECIMAL(5,2)`.
**No floats anywhere.** `pg` returns DECIMAL as strings
(`dialectOptions.decimalNumbers: false`) so the driver never introduces IEEE-754
rounding; `src/utils/money.ts` does all arithmetic with Decimal.js, rounding
half-up to 2 decimals to match the frontend's `round2`.

### Product discount

`products.discount_percent` is `DECIMAL(5,2) NOT NULL DEFAULT 0` with a
`CHECK (discount_percent >= 0 AND discount_percent <= 100)`. A product with no
discount reads back as exactly `0`, matching the frontend's existing `0` values.

### Transfer state machine

`stock_transfers.status` is a native PostgreSQL ENUM over exactly **8** values:

```
DRAFT → PENDING_APPROVAL → APPROVED → DISPATCHED → [PARTIALLY_RECEIVED] → RECEIVED
PENDING_APPROVAL → REJECTED
DRAFT | PENDING_APPROVAL | APPROVED → CANCELLED
```

The legacy simple-transfer values `PENDING`, `IN_TRANSIT`, and `COMPLETED` are
accepted **on input only** and mapped to canonical values by
`normalizeTransferStatus()` (`src/constants/enums.ts`). They are never persisted,
so the database enforces a single unambiguous state machine.

### Roles

Exactly three, matching `frontend/src/constants/roles.js`:
`SUPER_ADMIN`, `BRANCH_ADMIN`, `EMPLOYEE`. `SUPER_ADMIN` has `branchId = NULL`;
a database `CHECK` enforces that invariant in both directions.

### Auditing

`invoice_items` and `purchase_items` carry a full sale-time snapshot (price,
discount, GST, computed totals) so a posted invoice is never re-derived from the
current product row.

---

## Testing

```bash
npm test
```

323 tests across 10 files (all existing tests; new endpoints covered by integration test setup):

- `tests/unit/money.test.ts` — Decimal parsing, rounding, and range limits
- `tests/unit/constants.test.ts` — roles, permissions, transfer state machine
- `tests/unit/authorize.test.ts` — role, permission, and branch-isolation middleware
- `tests/integration/auth.test.ts` — login, session, branch isolation, user management
- `tests/integration/product.test.ts` — product CRUD, barcode, authorization
- `tests/integration/stock.test.ts` — stock reads/writes, branch isolation, adjustments
- `tests/integration/billing.test.ts` — invoice creation, calculation, stock deduction, idempotency, concurrency, cut-off price, payment status
- `tests/integration/transfer.test.ts` — create/submit/approve/reject/dispatch/receive/cancel, state machine, stock movements, concurrency, rollback, branch isolation
- `tests/integration/ledger.test.ts` — manual entry creation, authorization, branch isolation, idempotency, field mapping, balance calculation
- `tests/integration/purchase.test.ts` — purchase creation, authorization, branch isolation, calculation correctness (INTRA/INTER GST, invoice discount, round-off), idempotency, stock receipt, supplier ledger entry, item retrieval

`tests/globalSetup.ts` drops and rebuilds the **test** database from migrations
before each run, so a test can never pass against a stale schema. The schema is
only ever created by migrations — `sequelize.sync()` is never used.

---

## Project layout

```
src/
├── app.ts                     Express app assembly
├── server.ts                  Process bootstrap + graceful shutdown
├── config/
│   ├── env.ts                 Validated environment
│   ├── database.ts            Sequelize instance
│   ├── sequelizeConfig.ts     Shared connection config
│   └── logger.ts
├── constants/                 Roles, permissions, enums (frontend contracts)
├── database/
│   ├── migrate.ts             Umzug runner (up | down | status)
│   ├── seed.ts                Idempotent demo data
│   └── migrations/            001-foundation, 002-billing-stock-ledger
├── middleware/                authenticate, authorize, validate, errorHandler
├── models/                    18 Sequelize models + associations
├── routes/                    auth, branches, products, stock, billing, transfers, ledger
├── controllers/               authController, productController, stockController, billingController, transferController, ledgerController
├── services/                  authService, branchService, productService, stockService, billingService, transferService, ledgerService, passwordService, tokenService
├── validators/                Zod schemas
└── utils/                     money (Decimal.js), AppError, asyncHandler
```

`sequelize.config.ts` at the repository root re-exports
`src/config/sequelizeConfig.ts`, which lives under the TypeScript `rootDir`.

---

## Scope

**Done (Phases 1–8):** project scaffold and configuration, the full relational
schema with migrations and a seeder, authentication/authorization, Product
Master CRUD (global catalog), Branch Stock (per-branch inventory, batch
tracking, stock adjustments, barcode lookup), Billing (invoice creation
with authoritative server-side calculation, transactional stock deduction,
idempotency via `localId`, concurrency-safe row-level locking, PAID/PARTIAL/CREDIT
payment status, comprehensive test coverage), Stock Transfers (full
DRAFT → PENDING_APPROVAL → APPROVED → DISPATCHED → [PARTIALLY_RECEIVED] →
RECEIVED state machine, SUPER_ADMIN-only approval, transactional
TRANSFER_OUT/TRANSFER_IN stock movements, concurrency-safe row-level locking,
partial receiving, rollback on failure, branch isolation), Ledger (manual
DEBIT/CREDIT entries by SUPER_ADMIN + BRANCH_ADMIN, branch-scoped read,
cross-branch party balance via raw SQL aggregate, duplicate-reference
idempotency, `date` field contract matching the frontend LedgerView/LedgerEntryManager),
and Purchases (server-authoritative GST calculations — INTRA CGST+SGST / INTER
IGST, proportional invoice discount allocation, Math.round-equivalent round-off,
atomic transaction: stock receipt + PURCHASE movement + purchase header + items +
supplier DEBIT ledger entry, idempotency via `localId`, branch isolation,
full item snapshot including batch/expiry/free-quantity).

**Final phase complete:** All frontend API contracts are implemented. Migration 005 adds `crm_notes`, `crm_follow_ups`, `attendance`, `payroll`, `sales_targets`, `expenses`, `receipts`, and `supplier_payments` tables. The frontend `supplierMasterApi.js` and `customerMasterApi.js` writes are now wired to real-mode endpoints.

Two known follow-ups:

1. `bcryptjs` is used instead of the native `bcrypt` package. The algorithm and
   hashes are identical; switching is a one-line dependency change if the native
   module is preferred.
2. `npm audit` reports high/critical advisories through the dev-only `vitest`
   (v2) / `vite` toolchain. No production dependency has a high or critical
   advisory; production has 2 moderate findings.#   S U R G I C A L W O R L D - B I L L I N G - B A C K E N D  
 