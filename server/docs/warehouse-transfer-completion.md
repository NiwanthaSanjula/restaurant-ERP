# Storage → Sales Counter transfers

Create Transfer saves **Pending**, with the message **“Transfer created — Pending”**. It moves no stock. Edit the saved transfer to **Approved**, save, then reopen and select **Completed**. Only completion moves stock. Existing administrator permissions and final-state restrictions are unchanged.

Completion resolves both locations by their IDs. It debits the source's ID-keyed balance and credits the destination's ID-keyed balance, including a destination with no previous product entry. Product balance writes and transfer completion share a MongoDB transaction. An identical repeated completion remains read-only (HTTP 403 under the existing final-state policy); concurrent completion requests cannot post stock twice. Transaction failures roll back both sides and leave the transfer uncompleted.

A matching legacy name-keyed balance on either side blocks completion with HTTP 409 and `code: legacy_warehouse_balance`. The response's `review` array identifies item/SKU, location, side, conflicting keys and whether multiple balances make the record ambiguous. Neither legacy-only balances nor mixed ID/name balances are copied, merged or migrated.

Pricing is unchanged: an existing destination keeps its price/cost/alert settings. A new destination copies the source selling price; the existing fallback for a missing/zero source price is cost × 1.2. Configure an explicit product price if that inherited price is unsuitable. Completion does not change `isSellable`, product status or location activation. POS still requires the existing selling requirements.

Focused fixture command (server):

`npm test -- --runInBand src/services/purchaseStock.test.ts`

The mounted-route fixture receives 200 individual bottles into Storage, creates a Pending transfer for 50, approves and completes it, and verifies **150 Storage / 50 Sales Counter**, canonical keys and POS visibility. It also covers repeat/concurrent completion, legacy conflicts, rollback, permissions and preserved pricing/activation. All write checks use mocked storage, never the configured database.
