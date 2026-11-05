# La Tavola stock workflow: read-only review and first batch

Reviewed on develop, 4 November 2026. No live record, account, role, setting or
balance was changed. Verification writes use mocked storage only.

## Current read-only evidence

- Current item: `ARAL-KS-50KG`, Araliya Keeri Samba Rice (50kg), product ID
  `6aead84851a9f321890be188`. It is stock-tracked, Inventory only, unit `bag(s)`.
- Dry Store: `6aeabbd0422d8f880cb524ad`; Main Kitchen warehouse:
  `6aeabbb1422d8f880cb5249e`.
- Current purchase `PUR-1793775715713` is **Received / Paid**, with quantity
  10, unit cost 13,000, line subtotal 130,000 and grand total 134,784. This is
  the current record, not the earlier screenshot's Ordered purchase.
- Dry Store's `Product.warehouse[warehouseId].productQty` is **10 bags**.
  There is no Main Kitchen entry for this item.
- The product was created at 07:01:28 UTC; the purchase at 07:01:55 UTC. The
  07:05:05 UTC Product EDIT audit shows quantity **10 before and after**.
  That edit added `isSellable: false` and changed `stockAlert` from 0 to 3;
  it did not receive or increase stock. The unit was already `bag(s)`.
- There are no current transfers, adjustments, purchase returns, sales,
  kitchen ingredient records, recipes, kitchen movements or unit-conversion
  records. A live Dry Store → kitchen → recipe → POS trail cannot therefore
  be demonstrated. Quantity numerically matches the purchase, but an older
  comprehensive movement ledger does not exist; the original creation route
  and any removed historical records cannot be proved from this snapshot.

## Records and screens

| Screen/path | Reads or writes | Confirmed interpretation |
| --- | --- | --- |
| POS Products / Inventory Items | The same `Product` records and warehouse map | Selling type controls POS eligibility; it does not select the stock ledger. |
| Create/Edit Item | Product identity, unit, prices and warehouse quantities | Quantity is a direct opening balance or manual overwrite, not a purchase receipt. Zero is now allowed; negatives are rejected. |
| Create Purchase: select existing | Reads `Product`, stores its existing ID in `Purchase.items` | Saving a purchase does not create another item. |
| Create Purchase: Create Item | Explicit `POST /purchases/quick-product`, then stores that product ID | Before this batch it created zero-stock Active products without selling classification; unit could default to pcs. This explains classification review after creation. |
| Purchases / Receive Stock | Purchase plus selected product warehouse entries | New physical receipts increment warehouse stock in the stored stock unit. Printing an order does not receive goods. |
| Warehouse name → stock | Warehouse metadata and `Product.warehouse` | Includes stocked Sellable goods, Inventory only items, zero quantities and legacy stock requiring review. No mixed-unit total is fabricated. |
| Transfers | `Transfer` and Product warehouse maps | Completed transfers move numeric units between warehouse entries. They do not change kitchen inventory. Existing code can create destination keys by warehouse name while POS selects by ID. |
| Stock Adjustments | `InventoryAdjustment` and warehouse product/batch/variation quantities | Completed changes apply deltas; edit/cancel/delete can reverse them. Pending adjustments do not establish on-hand stock. |
| Kitchen Inventory opening/stock in/out | `KitchenInventoryProduct.currentStock` and `KitchenStockMovement` | A separate global balance without a warehouse ID. Opening/manual movements do not debit Dry Store. |
| Recipe configuration | `KitchenRecipe` → kitchen ingredient IDs | Selects kitchen ingredients, not warehouse balances of similarly named products. |
| Stocked-item POS / ordinary sales | Product warehouse stock and Sale flags | Stocked goods deduct from their selected warehouse. |
| Prepared-item POS / ordinary sales | Recipe, kitchen currentStock, kitchen movements and Sale flags | Deducts the independent kitchen balance. POS's atomic checkout and retry protection remain intact. |
| Sale cancellation/reversal | Sale flags, warehouse and kitchen reversal helpers | Separate reversal paths must be included in any future consolidated ledger. |
| Purchase returns | PurchaseReturn and Product warehouse stock | Separate decrease/reversal code, not a kitchen refill. Needs a broader receive/return lifecycle review. |
| Sale returns | SaleReturn and Product warehouse stock | Restores warehouse quantities; no kitchen ingredient movement reconciliation in that controller. Prepared-return policy requires review. |
| Product/warehouse deletion and seed utilities | Can remove a stock holder or write opening data | Additional stock/reference safeguards and opening-balance provenance are follow-up work. No deletion or seed was executed. |

## Separate balances and pack conversion: explicit blocker

Stock-writing route/source index (all API paths have `/api` prefix):

- Items/opening/manual balances: POST `/products`, PUT `/products/:id`;
  `controllers/product/index.ts`. Deleting products/warehouses can orphan or
  remove a stock holder and still needs separate reference safeguards.
- Purchases: POST `/purchases`, POST `/purchases/:id/receive`, PUT and DELETE
  `/purchases/:id`; `controllers/purchaseController.ts` → `services/purchaseStock.ts`.
- Warehouse transfers: POST `/transfers`, PUT and DELETE `/transfers/:id`;
  `controllers/transfer/index.ts`.
- Adjustments: POST `/adjustments`, POST `/:id/approve`, PUT `/:id`, PUT
  `/:id/cancel` and DELETE `/:id` under `/adjustments`; `controllers/inventory/index.ts`.
- Kitchen opening balances: POST `/kitchen/products`; manual movements:
  POST `/kitchen/products/:id/stock-in` and `/stock-out`; `controllers/kitchen/index.ts`.
- Sales: POST `/pos/sale`, POST `/sales`, PUT `/sales/:id`, `/:id/complete`,
  `/:id/cancel` and DELETE `/sales/:id`; `services/posCheckout.ts`,
  `controllers/sale/index.ts` and `controllers/kitchen/deduction.ts`.
- Returns: POST `/purchase-returns`, PUT/DELETE `/purchase-returns/:id` and
  bulk deletion; warehouse return/reversal logic in `purchaseReturnController.ts`.
  Sale-return warehouse restoration/reversal is in `controllers/saleReturn/index.ts`;
  its PUT/DELETE/bulk-delete routes are separate from the sales cancellation helpers.
- Seed/opening fixture scripts are another direct writer, but were not executed.

`Product.warehouse[warehouseId].productQty` and
`KitchenInventoryProduct.currentStock` are **separate balances**. Their optional
`inventoryProductId` link supplies stock-alert metadata; it does not synchronize
quantities. A Main Kitchen warehouse does not automatically feed recipe stock.

Recipe conversion only uses identical short units (factor 1) or an explicitly
stored directed `KitchenUnitConversion`. There are no such rules in the current
database. No per-product pack size links one rice bag to kilograms/grams, and
purchase lines previously persisted only product ID, quantity and cost.
"50kg" in a name is not authoritative conversion metadata. A global bag→gram
rule would be unsafe for differently sized bags.

This batch does not bridge or merge those ledgers, issue kitchen stock, infer
pack factors or migrate quantities. Ten received bags remain ten bags, not an
assumed 500 kg or 500,000 g. Kitchen/transfer changes are deliberately deferred.

## First batch

The pre-batch purchase creator posted stock for Paid purchases unless status
was Draft, so a Paid Ordered purchase could add stock and an Unpaid Received
purchase could add none. Its edit/delete code reversed quantities without a
receipt marker or transaction; clamping at zero could recreate consumed stock
on a later replay. These were confirmed in the existing source, not by writing
an extra live purchase.

- Warehouse names open `/warehouses/:id/stock`; Add Warehouse is retained.
- Create Item is distinct from receiving: definitions can start at zero.
  Positive creation quantities are labelled opening balances. Inline creation
  requires selling classification and a stock unit, with zero opening stock.
- New orders snapshot stock unit and receipt version. Ordered/Pending add no
  stock regardless of payment label. Received is physical receipt; payment
  labels and paid/due amounts are not a stock authority.
- `POST /purchases/:id/receive` applies quantities, receipt marker and audit
  entry in one snapshot/majority transaction, with no non-transactional fallback.
  Replays, including after consumption, never replenish stock.
- Form retries carry a stable request ID: immediate Received creation reuses
  the purchase; changed payloads under that ID are rejected. Other API clients
  must also reuse a request ID to deduplicate creation; immediate Received
  creation without a key is rejected. Receipt replay is always keyed by purchase ID.
- Received metadata edits do not reverse/reapply stock. Received line/warehouse
  rewrites and deletion are rejected. Supported unreceived deletion changes no stock.
- Legacy Received records are not re-posted or backfilled. Legacy unreceived
  orders without a provable posting version are blocked for reconciliation.
- Changed units, unsupported variant/batch identities, legacy weight structures
  and ambiguous warehouse keys are rejected before posting. No price or unit
  conversion is invented. Variation purchase lines still need persisted identities.
- Existing canonical grants are reused: Purchases Read plus Products Update
  protect stock-changing purchase operations; Products Create protects inline
  creation; Products Read protects warehouse stock. No account/role grants change.
  This does not rewrite other legacy stock endpoint policies.

## Follow-up order

1. Canonical warehouse IDs and atomic transfer/reversal safeguards, then an
   explicit warehouse→kitchen issue with one shared movement reference. Do not
   independently add the same goods to both ledgers.
2. Choose base units and per-item pack factors with receipt/issue snapshots.
   Decide whether warehouse quantities stay in packs or base units. Do not
   infer from names or migrate these existing ten bags in this batch.
3. Make kitchen locations, prepared returns and recipe deduction reconcile
   with the chosen source. Prepared POS fixtures pass; live kitchen data is empty.
4. Validate thresholds in each balance's unit: copying a bag alert into kg is
   not conversion. Separate minimum/target stock, lead time and reorder
   suggestions. Automatic reordering is not implemented by this batch.
5. Complete variation receipts, return idempotency, manual edit/deletion guards
   and movement-ledger coverage. Receipt safety does not reconcile all other writers.
