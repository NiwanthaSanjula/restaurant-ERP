# REST-014 portfolio demo seed

Run from `server/` (or use `npm --prefix server run ...`). The command loads the existing server `.env` and the same `MONGODB_URI`/default as the server. It neither chooses another database nor creates a database backup. No application startup, mailer, upload or payment-provider code is invoked.

```powershell
npm run seed:demo -- --as-of 2026-11-02 --cutoff 20:00
npm run seed:demo -- --as-of 2026-11-02 --cutoff 20:00 --apply
npm run seed:demo -- --verify
npm run seed:demo
```

The first command is read-only. `--apply` is required for writes. Omit date/cutoff for an initial plan using today's Colombo date and a cutoff before now, capped at 20:00. Use the same explicit date/cutoff for the reviewed dry-run and initial apply. After initial apply, the manifest's date, cutoff, creator reference, currency, random seed and fixture hashes are immutable. Repeated commands use these stored anchors, even on another day. The seed requires `develop` and `Asia/Colombo`.

## Data and dates

The window includes the previous 60 Monday–Friday business dates, today and all intervening weekends, reflecting a restaurant trading seven days. No public-holiday calendar is configured. For 2026-11-02 this is 85 calendar trading dates, 2026-08-10 through 2026-11-02. UTC instants are explicitly derived from Colombo local times. Sales `date`/`createdAt`, purchases `purchaseDate`/`createdAt`, expenses `date`/`createdAt`, and register `openTime`/`closeTime` are populated separately and cross-checked. No future activity is allowed.

Thirty sellable Sri Lankan dishes/drinks include four portion variants and four packaged beverages. Fourteen additional raw-material Product SKUs are `Pending`, so ingredients do not appear as sellable active POS menu items. All masters are linked by actual schema fields. Prices are independently specified native LKR or EUR demo price lists, not an exchange-rate conversion. Other currencies stop preflight. Settings/currencies are never created or changed. If no system settings record exists, the same first-currency fallback as `CurrencyContext` is preserved.

Fictional customers/suppliers use clearly non-dialable placeholder numbers. Explicit follow-up authorization permits one dedicated fictional attribution user and one dedicated role, both with deterministic IDs. The user has `isActive: false`, legacy label `staff`, and an explicit role assignment. Existing login and authentication middleware deny deactivated users without any authentication-code changes. The Role schema requires at least one grant, so the role has only `managePOS:view_pos` (read-only), with no administrator/settings/write grants. All seed creator and register-user references belong to this cashier. Existing users, roles and open registers are untouched.

A cryptographically generated password is immediately bcrypt-hashed at cost 12; plaintext is neither retained nor printed. Its hash is stored only in the User document, never copied into seed metadata. Existing stored credentials are reused on reruns and never updated. Credential fields are excluded from fixture/manifest fingerprints so a resumed, never-inserted account can receive a fresh generated secret without changing fixture identities. Stored identity policy and bcrypt format/cost are independently verified; reruns stop if the demo account was activated or its role escalated, without overwriting those edits.

## Stock and financial construction

Opening stock is **zero**, recorded in the seed manifest. Paid/received purchases replenish the seed pantry and counter. A completed inventory decrease records each pantry issue to the kitchen; matching manual kitchen receipts identify that issue in their notes. Every prepared sale consumes its exact portion recipe, with `source: sale` movements and matching `saleId`. Packaged products reduce counter stock. Final stock is computed from chronological ledgers, not invented opening quantities. Price/cost snapshots, movement quantities, sale totals/profit, payment histories, denomination counts, and register cash totals are reconciled before and after storage.

Fixtures are constructed directly using the existing Mongoose schemas and then inserted as fully validated, deterministic documents. This avoids invoking known inconsistent purchase/POS/kitchen workflows. All amounts are exact-paid; cash/card/bank transfer and mixed cash/card payments are represented. Cash tender equals the sale amount, so change and balance are zero. EUR prices use whole units, which the existing register denomination schema can represent exactly.

Nonzero taxes/discounts, special offers, returns, partial payments, and old MenuItem/Order/table workflows are excluded: existing sale paths disagree about fixed-discount, tax/shipping and profit behavior; purchase records do not carry a consistent partial-payment ledger; returns require additional stock/refund reversal rules. This seed does not repair or prove correctness of live checkout. Expenses are documented outside the POS drawer, whose existing reconciliation counts sales cash only.

## Ownership, writes, recovery and verification

The namespace is `servesmart-demo-rest014-v1`. All document and subdocument IDs are SHA-256-derived ObjectIds, invoice/purchase/issue/expense references use `SSDEMO14-`, and the dedicated `demo_seed_manifests` record stores ownership, fixture hashes and anchors. There are no extra unsupported fields in application documents. Random generation uses the fixed seed `140026`.

Preflight validates every real schema, required relationship, actual and declared unique index, pending identifier, recipe, stock snapshot, financial total and business date. Automatic index/collection creation is disabled during dry-run; application indexes are never rewritten. The manifest's primary `_id` provides seed-run ownership.

On a replica set/sharded deployment, application records and final manifest state are written/verified in a transaction. A `pending` manifest is reserved first so an aborted run retains its exact anchors. On standalone MongoDB, the same manifest plus deterministic IDs permits resumability: rerun dry-run, then `--apply` to insert **only missing** records. No stock `$inc`, overwrite, delete, drop or database clear is used. Partially completed data should not be used until verification completes. If a partial run's existing seed records were edited, recovery stops for manual reconciliation rather than overwriting them.

A completed rerun skips all existing owned records, including user edits, and reports edited-record drift without overwriting it. Deleted records of a completed seed are not recreated. `--verify` compares untouched seed fixtures and runs the ledgers plus read-only report/dashboard aggregations; edited completed records are reported as preserved drift and strict fixture verification is withheld. Hashes of non-seed records are compared before/after apply without exporting records or credentials. No database backup is made.

Preflight also rejects any seed register interval overlapping existing register history for the required creator. Existing open registers are treated as continuing indefinitely. Closing or backdating a real register, modifying existing users, or ignoring overlaps is outside this utility's authorization.

### Dedicated attribution authorization

The original read-only preflight found the existing user's open register from 2026-07-01, overlapping the planned window. Follow-up authorization explicitly permits the separate disabled demo cashier above. The existing register and overlap validation remain unchanged; new sessions belong to the dedicated cashier, so there is no cross-user collision. Dry-run and apply both validate the revised identity, schema, indexes, ownership and timelines.

### Verified application on 2026-11-02

The revised dry-run passed, and `--apply` committed 6,256 application records plus one seed manifest to the current configured database. These include one deactivated demo cashier, one read-only role, 30 sellable products, 14 raw-material SKUs, 14 kitchen ingredients, 30 recipes, 769 sales, 65 purchases, 173 expenses, 85 closed registers, 13 pantry issues and 5,014 kitchen movements, plus supporting masters. Activity covers 2026-08-10–2026-11-02; today's eight seeded sales total EUR 149. The existing EUR fallback was preserved.

Post-commit `--verify` passed all references, chronological stock/recipes, financial totals, register cash and report-date checks. The subsequent read-only dry-run reported `wouldInsert: 0`, `skipped: 6256`, with no fixture drift or repeated stock effects. Apply's full non-seed record fingerprints matched before/after, preserving existing accounts, roles, credentials, settings and the open register. No other database, database backup, email, provider call or upload was used.

```powershell
npm test -- --runInBand src/scripts/demoSeed/plan.test.ts
npm run build
git diff --check
```

Test storage is mocked; tests never connect to a database. Do not run the old `src/seed.ts`: it deletes existing application/account data and is intentionally unrelated to this command.
