# Completed POS kitchen tickets

After POS payment succeeds, the **Sale saved** dialog offers **Print Receipt** and, for orders containing prepared dishes, **Print Kitchen Ticket**. **Done** returns to POS. **Open saved sale / reprint later** opens the same saved order.

To recover a ticket later: **Sale → Sales → sale reference → Sale Details → Print Kitchen Ticket**. This uses the existing sale detail read permissions. No new printing endpoint, permission grant, checkout, or stock operation is involved.

POS checkout snapshots the server product's prepared/stocked classification (`isPrepared`, derived from the existing `isInventory` flag), together with the existing saved product name and quantity. Checkout and the saved-sale read return an allowlisted kitchen-ticket document: sale reference, saved business time, and prepared names/quantities. Reprints never look up the current product or recipe, so later catalog changes do not rewrite an old ticket.

Orders containing only reliably classified stocked goods omit the action. Historical orders missing any line's classification show **Kitchen ticket unavailable**; they are not backfilled or guessed from current catalog data. Prepared variations are also unavailable in this batch. Receipt output still includes stocked and prepared items with its usual amounts. Kitchen tickets contain no prices, payments, or customer information, and reuse the receipt's white-paper styles and iframe printing path.

Focused database-free checks:

```powershell
cd server
npm test -- --runInBand src/routes/posCheckout.test.ts src/services/posCheckoutClient.test.ts src/utils/kitchenTicket.test.ts
```

The mounted-route fixture orders two Fried Rice portions (150 g rice each) and one bottled water. It verifies one persisted sale, one 300 g kitchen deduction, one bottle deducted, and unchanged balances after reopening the saved sale and replaying the same checkout. Renderer checks cover receipt amounts, ticket allowlisting, escaping, missing historical data, and white print styles.

No kitchen queue, automatic kitchen dispatch, printer routing, or variation support is added. Physical printer and operating-system print dialogs still require a local printer check.
