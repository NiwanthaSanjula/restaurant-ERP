# Warehouse alerts and reorder

Open **Warehouse → Storage → stock**. Each line shows **On Hand**, **Incoming**, the existing `Product.warehouse[locationId].stockAlert` in the item's recorded stock unit, and its alert state. **Edit threshold** changes only that field; it never replaces a warehouse entry or updates quantity. Zero is a valid threshold. **Clear threshold** leaves it explicitly unconfigured. Positive on-hand stock at or below its configured threshold is **Low Stock**; zero on hand is **Out of Stock**, even without a threshold. Thresholds remain visible when unconfigured.

**Reorder → Create Purchase** selects the saved item and Storage location. Quantity is left empty for staff to enter; Unit Cost uses the location's saved cost for review. The optional saved product `supplier` assignment is used only if it uniquely identifies a current supplier by ID or exact name. No supplier is guessed from previous orders, categories, or the supplier list. Save Order keeps the order unreceived. Use **View Orders / Receive Stock → order Actions → Receive Stock → View Warehouse Stock** to receive through the existing transactional, idempotent receipt path.

Incoming is the sum of all unreceived Ordered/Pending purchase lines at this location whose stock receipt version and saved stock unit can be verified. Received orders and orders with a receipt marker contribute nothing. Incoming never changes alert state, which uses On Hand alone. Legacy/unverified posting or mismatched units show Incoming as unavailable with a review explanation, rather than treating unknown quantities as zero. Incoming-only items are visible before their first receipt, without creating a stock record. Their threshold can be edited here after the first receipt.

Permissions are unchanged: Products Read for stock; Products Update for threshold editing; Products Update plus Purchases Read for Reorder/receipt; Purchases Read for Incoming. Without Purchases Read, On Hand and thresholds remain readable, but Incoming is unavailable. No role-name fallback or grants are added. Threshold edits and reordering from this page support canonical single-item stock. Variation, batch, legacy-weight and ambiguous name-keyed balances remain review cases, without migration. Pack conversion, partial receipts, and payment tracking are outside this batch.

Database-free checks:

```powershell
cd server
npm test -- --runInBand src/services/purchaseStock.test.ts src/routes/productEligibility.test.ts
```

The mounted-route flour fixture starts at 4 bags, threshold 5. An order for 10 leaves 4 On Hand / 10 Incoming and Low Stock. Receipt leaves 14 / 0 and clears the alert. Receipt retry posts no further stock. Checks also cover threshold-only updates, zero/missing thresholds, authorization, invalid payloads, unit/legacy review, multiple orders, first-time incoming stock, and explicit supplier defaults. Browser write checks use intercepted fixtures, never the configured database.
