# kaizen-inventory
Web app to track coffee shop inventory and generate order lists. See [SPEC.md](SPEC.md).

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind) · Prisma 7 · Neon Postgres · Vercel

## Local setup

1. `npm install` (also runs `prisma generate`)
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL`: Neon **pooled** connection string (Neon console → Connect → "Connection pooling" on)
   - `DIRECT_URL`: Neon **direct** connection string (pooling off). Used for migrations.
   - `SEED_ADMIN_PIN`: the first admin's Toast PIN
   - `SESSION_SECRET`: signs session cookies. Generate with `openssl rand -base64 32`
   - Tip: point local `.env` at a Neon `dev` branch, not production.
3. `npm run db:deploy`: apply migrations
4. `npm run db:seed`: create the 3 cafes and the first admin (`npm run db:seed:sample` also adds sample sections/items)
5. `npm run db:check`: confirm the database enforces the quantity-rule constraints
6. `npm run dev` and open http://localhost:3000

## Scripts

| Script | What it does |
|---|---|
| `db:migrate` | Create a new migration after editing `prisma/schema.prisma` (dev only) |
| `db:deploy` | Apply pending migrations |
| `db:status` | Show migration status |
| `db:seed` / `db:seed:sample` | Idempotent seed |
| `db:studio` | Browse data in Prisma Studio |
| `db:check` | Constraint smoke test (cleans up after itself) |
| `test` | Vitest: unit tests, plus sign-in tests against the database in `.env` |
| `test:auth` | End-to-end authorization checks over HTTP. Start the app first (`npm run dev`); set `BASE_URL` to test another server |
| `typecheck`, `lint` | Static checks |

## Deploying (Vercel)

1. Import the GitHub repo in Vercel (framework preset: Next.js).
2. Project → Settings → Environment Variables: add `DATABASE_URL` (pooled) and `SESSION_SECRET` for Production and Preview.
   Neon's Vercel integration can set this up automatically, including a database branch per preview.
3. Migrations are **not** run during the build. After merging a schema change, run
   `npm run db:deploy` against production (with `DIRECT_URL` pointed at the production branch).

## Notes

- Auth: PIN sign-in sets a signed, httpOnly 7-day cookie holding only the user and selected cafe.
  Roles and active status are re-read from the database on every request (`src/lib/auth/dal.ts`);
  every page and Server Action must call `requireUser()` or `requireAdmin()`.
  Wrong PINs are rate-limited per IP (`src/lib/auth/rate-limit.ts`).
- Dates: timestamps stored in UTC; business dates are America/Los_Angeles calendar dates (`src/lib/time.ts`).
- Some integrity rules live in hand-written SQL in `prisma/migrations/*_init/migration.sql`
  (CHECK constraints and a `NULLS NOT DISTINCT` unique index on `QuantityRule`).
  If a future migration diff tries to recreate that index without `NULLS NOT DISTINCT`, re-add it by hand.
