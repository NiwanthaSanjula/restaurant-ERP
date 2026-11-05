# La Tavola connected restaurant dataset

The `seed:latavola` command uses the server's existing `.env` connection configuration. It requires `develop`, configured LKR, Asia/Colombo, a transaction-capable deployment, and an existing active account with explicit POS view/create grants. It never starts the application, sends mail, changes permissions/settings, creates a login account, or connects to another database.

```powershell
cd server
npm run seed:latavola -- --as-of 2026-11-04 --cutoff 20:00
# Review the successful dry run and copy its planHash:
npm run seed:latavola -- --as-of 2026-11-04 --cutoff 20:00 --apply --expect-plan <planHash>
npm run seed:latavola -- --verify
npm run seed:latavola
```

Dry run is the default and writes nothing. Initial apply requires the exact reviewed plan hash. An already-applied namespace always schedules zero inserts and zero stock effects. Edits and deletions after loading are preserved and reported, never overwritten or recreated. A changed initial master/stock baseline stops preflight. The manifest and all application writes commit together; an unsuccessful transaction rolls back the whole load. Metadata/index checks run outside the data transaction because MongoDB rejects metadata commands within one; record collisions, references and stock checks still use its snapshot.

The namespace is `latavola-portfolio-v1`, with fixed random seed `20261104`, deterministic document and embedded line IDs, and an immutable thirty-day anchor. The initial load covers **2026-10-06 through 2026-11-04**. Sale dates/creation dates, purchase dates/receipt markers, kitchen movement dates, expense dates, and register open/close times are populated explicitly. Reports use the current app's business-date fields, not invoice strings. Sale references use the active reader's supported `SALE-####` format; kitchen tickets, receipt and Sales show the same saved reference.

## Records added by collection

| Collection | Added |
|---|---:|
| categories | 1 |
| brands | 1 |
| suppliers | 3 |
| expensecategories | 4 |
| products | 27 |
| kitcheninventoryproducts | 12 |
| kitchenrecipes | 14 |
| purchases | 39 |
| transfers | 7 |
| kitchenstockmovements | 744 |
| sales | 145 |
| pos_sessions | 30 closed |
| expenses | 30 |
| demo_seed_manifests | 1 |

The 1,057 application records include 37 received purchases, one Ordered flour reorder, one Pending produce order, six completed transfers and one pending transfer. Kitchen movements comprise 42 linked warehouse issues and 702 recipe deductions. There are 16 sellable dishes/drinks: fourteen prepared items plus bottled water and ginger beer. Prices are illustrative LKR prices, including Chicken Fried Rice 1,150, Vegetable Fried Rice 850, Chicken Kottu 1,250, Lime Juice 350, and the existing 1L water SKU at its preserved price of 100.

Two existing locations (**Main Storage**, **Sales Counter**), six units, four categories, five suppliers, the existing authorized attribution account, and the existing 1L water product are reused without renaming/reclassification. The three new suppliers use natural fictional business names and no contact details. All existing users, roles, settings, supplier records, existing transactions and the current open register remain intact.

## Stock and money

- Raw ingredients are explicitly Inventory only and stay out of POS. Warehouse quantities remain in recorded stock units. Kitchen ingredients use grams, millilitres, or the existing Piece unit. Each ingredient saves an explicit per-item conversion (1 kg = 1,000 g, 1 litre = 1,000 ml, same Piece unit = 1). Recipes use their ingredient's exact kitchen unit, so no global unit-conversion or pack rule is invented.
- Weekly received purchases supply warehouse stock before the linked kitchen issues. Each prepared sale has its exact aggregate ingredient out movements and both deduction markers. Kitchen final balances are independently reconciled with purchases/issues/recipes, with enough stock remaining for the menu.
- Historical water receipts/transfers cover their historical sales separately. A further 200 individual bottles are received and 50 transferred to Sales Counter after 4 November's imported sales. The original 99 bottles in Main Storage are preserved. Final water stock is **249 Main Storage / 50 Sales Counter**. The original pending user transfer is untouched.
- Flour ends at **4 kg On Hand / threshold 5 kg / 10 kg Incoming**. Its kitchen recipe balance is separate. Ordered/Pending purchases never add on-hand stock; received purchases have the existing receipt version, unit snapshots and marker. Received seed orders can be re-read or replayed without posting quantities again through the existing receipt path.
- Sales use supported cash, card, bank-transfer and cash/card combinations. Net cash excludes change; payment histories, costs, totals, denominations and each closed register reconcile. Total seeded sales are **LKR 215,790**, with **LKR 79,230 net cash**. On the reviewed **4 November** anchor date, four seeded sales total **LKR 3,830**. The preserved existing sale makes that date's all-data total **5 sales / LKR 3,930**. Local time crossed into 5 November during final verification; 5 November activity was not added and dates never shift on a rerun.
- Existing records are fingerprinted around apply. The only allowed existing-record changes are +150 to the water's Main Storage quantity and its new Sales Counter entry with 50 bottles and the existing cost/price. No original stock is used as unexplained historical opening stock. Expenses are documented outside the POS drawer; no unsupported drawer cash-out is implied.

## Exclusions

Customers are skipped because their schema requires a mobile number; no fake number or email-in-phone value is invented. Completed sales use the existing Walk-in contract. Users/roles/settings/currencies remain unchanged. No variants, partial payments, refunds, purchase/sale returns, tax/discount experiments, tables, legacy menu/orders, or new kitchen queues are created. Those paths need additional contracts or are not part of active POS. There is no invented opening adjustment, global pack conversion, or fabricated API activity log. Receipts and kitchen tickets derive from saved sales, not separate collections.

## Staff click paths

1. **OPEN POS → Warehouse → Sales Counter**. The existing authorized account already has an open register; no new register was opened or closed by the seed.
2. **Warehouse → Main Storage** for stock, including flour's alert/incoming quantity. **Transfers** shows the completed delivery and preserved pending transfers. **Kitchen Inventory** shows the independent recipe balances and linked issue history.
3. **Purchase / Inventory → Purchases** for received orders and open flour/produce orders. Receiving is a real write: do not click Receive Stock merely to inspect the dataset.
4. **Sale → Sales → SALE-7141** for 4 November's two Chicken Fried Rice portions and one bottled water. Use **Actions → Download Receipt**, or open its sale details and **Print Kitchen Ticket**. Reprinting never checks out again.
5. Reports: select **2026-10-06–2026-11-04**. Seed-only totals above exclude preserved existing data. The default all-data reports include it.

Focused checks:

```powershell
npm test -- --runInBand src/scripts/laTavolaSeed src/routes/posCheckout.test.ts src/services/purchaseStock.test.ts src/controllers/kitchen/deduction.test.ts
npm run build
```

Initial-load verification uses actual stored-record hashes, real MongoDB aggregations, and the current read handlers after checking the attribution account's explicit permissions. Browser rendering can use those real scoped read responses with writes blocked; this does not prove an unattached user's authenticated HTTP session or physical printer. No login token is generated for verification.

The completed load passed 17 focused seed checks, existing POS/purchase/recipe regression checks, the server build and `git diff --check`. Live read checks confirmed all 16 counter prices, exclusion of inventory-only items, recipe-stock availability, all 12 issue-conversion previews, purchase/stock reads and the existing open register. Light/dark browser rendering using those real read responses opened purchase details, receipt and kitchen ticket; reprinting made no mutation request. The post-load dry run reports 1,057 owned records, zero inserts, zero repeated stock effects, and no edited/deleted fixtures. Read results, screenshots and print PDFs are under `%TEMP%/LaTavola-dataset-verification/`.
