POS checkout (`POST /api/pos/sale`) requires the existing `managePOS:create_sale` grant, an owned open register, an explicit `warehouseId`, and a stable `checkoutRequestId` (16–100 letters, digits, underscores or hyphens).

The active POS persists the exact request and generated ID before sending it. Retries, including reloads and lost responses, reuse that ID. A changed request with an unresolved ID is rejected. Do not collect payment again while the outcome is unconfirmed. A definite validation failure permits correcting the cart; an ambiguous failure keeps the pending request. Pending-request storage must be available before checkout can proceed.

The server derives an actor-scoped deterministic sale `_id`, relying on the existing unique primary index. A replay returns the persisted receipt without incrementing invoice counters or changing stock. Reusing the ID for different sale details returns 409. Invoice references include the business date so the daily sequence does not collide with earlier days.

Product names, prices and variation prices come from the selected warehouse's active product records; client names/prices and offer amounts are not authoritative. Existing recipe selection and unit conversions determine prepared-item consumption. Kitchen ingredients use the existing shared kitchen store (the schema has no warehouse dimension). Packaged-product stock is deducted from the selected warehouse.

MongoDB transactions are required. Sale creation, register serialization, invoice numbering, main inventory, kitchen consumption and stock movements commit together. Unsupported transaction deployments return 503 without a nontransactional fallback. Existing non-POS stock-helper behavior is unchanged.

Payment amounts are validated and rounded to currency cents. Only cash may fund change. For a 9.50 sale tendered with 10.00 cash, the sale stores `cashTendered: 10`, `changeAmount: 0.50`, `cashAmount: 9.50`, and a 9.50 applied cash payment. Existing register aggregates sum the net `cashAmount`. The checkout response and printed receipt use persisted server values; sale detail/reprinted receipts expose stored tender and change when present. Historical records are not rewritten.

Focused checks (mocked storage only): `npm test -- --runInBand src/routes/posCheckout.test.ts src/services/posCheckoutClient.test.ts src/controllers/kitchen/deduction.test.ts` from `server`. Physical printing and real MongoDB transaction/concurrency behavior still require an approved live checkout test.
