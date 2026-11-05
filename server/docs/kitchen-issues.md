# Issue to Kitchen

Warehouse stock and kitchen recipe stock are separate balances. Warehouse stock → **Issue to Kitchen** moves a single, stock-tracked item into an explicitly linked kitchen ingredient. Ordinary warehouse transfers are unchanged.

1. Open a warehouse's stock page and choose **Issue to Kitchen**.
2. Select its linked ingredient, or explicitly confirm linking an existing unlinked ingredient. If none exists, create a linked ingredient in its recipe unit with **zero opening stock**, then return here. Existing stock is never silently reset.
3. Confirm an item-specific conversion: for example **1 bag(s) = 50,000 g**. Bag size is not inferred from names, prices, categories, or global recipe conversions.
4. Save the conversion, enter the number of warehouse units, and review both resulting balances before confirming.

Conversions are stored on the linked ingredient, tied to the exact item, source unit and recipe unit, with a revision and audit record. Matching SI mass/volume units must use compatible ratios; mass-to-volume conversion is unsupported. Changes to units or links invalidate the saved conversion. Multiple linked ingredients require an explicit selection. Configuring a conversion changes no stock.

## Authorization and atomicity

- Options/preview: existing `manageProducts:read` and `manageKitchen:view_kitchen_inventory` grants.
- Conversion/issue: existing `manageProducts:update` and `manageKitchen:edit_kitchen_inventory` grants. The UI also needs the read grants.
- POST `/warehouses/:id/kitchen-issues`, with a stable `requestId`, debits the canonical warehouse quantity, credits the kitchen ingredient quantity, writes one `KitchenStockMovement` (`source: warehouse_issue`) holding **both legs**, their units, conversion and before/after balances, and records an activity log. All writes share one MongoDB transaction; unsupported deployments fail closed.
- That movement's existing unique `_id` is deterministically derived from the actor and request ID. Identical retries return the original result, even after later sales or conversion changes. Changed payloads with the same key are rejected. No new collection/index or migration is required.
- The dialog persists an unresolved request in per-account session storage before posting. Reopen it and **Retry same issue** after an uncertain response. Do not start a new request to recover an uncertain operation. Storage must be available before posting. The movement reference is visible in the result and warehouse issue history; the kitchen movement note also describes both legs.

## Scope and verification

Only single items with canonical warehouse keys and explicit stock tracking are supported. Variations, batches and legacy/weight modes need separate reconciliation. Missing links, unknown units, incompatible ratios and insufficient stock are rejected. No automatic kitchen refill, warehouse transfer, stock migration, valuation adjustment, reorder policy or low-stock unit conversion is introduced.

`npm test -- --runInBand src/routes/posCheckout.test.ts` (server) exercises the actual mounted permission chain and issue/checkout services against transactional mocked storage: 10 rice bags, issue one at 50,000 g/bag, sell a dish consuming 150 g, then retry the issue. Expected balances: 9 bags and 49,850 g; one issue movement. It also covers rollback, concurrent/uncertain retries, stale conversions, invalid units and authorization. No configured database writes are part of these checks.
