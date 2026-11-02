# Purchase reads and reports (REST-016)

`GET /api/purchases`, `GET /api/purchases/:id`, and the purchase-return read
routes require authentication and the explicit canonical `managePurchases:read`
grant on the assigned active Role. Purchase reports use these same endpoints;
there is no separate report API or unauthenticated alias. The existing frontend
`/return_to_supplier` alias has the same read guard. Role names and general
report grants do not authorize these reads. Existing roles are not automatically
granted access; an authorized role administrator must explicitly grant it.
Normal REST-011 permission refresh rules still apply.

The purchase list remains paginated. `summary.totalPurchases` is the sum of
`grandTotal` across the entire query filter, not the page. Supplier and warehouse
IDs are ObjectIds in both find and aggregate filters. Dates retain the existing
Asia/Colombo purchase-date filtering. Sorting includes `_id` to break ties.

The report retrieves every matching page with identical filters, verifies unique
IDs, counts, and aggregate agreement, and exports those complete rows. A failed
or inconsistent page sequence fails the report rather than exporting a partial
result. This detects common concurrent changes; it is not a transactional
snapshot across page requests. Return reports sum the persisted
`totalReturnAmount` across all matching pages, retaining their existing date scope.

Purchase stores `paymentStatus` and `paymentMethod`, but no authoritative paid
amount, due amount, or payment ledger. Create/update accept status independently
of amounts. Accordingly list/detail responses explicitly return `paid: null` and
`due: null` for all statuses, including zero-total purchases. The client displays
**Not recorded**, and never substitutes zero or derives amounts from status.
Explicit numeric zero remains displayable when supplied by a verified amount
contract in future. Adding payment persistence/reconciliation needs a separate
financial-contract task. No records or schema were migrated for this change.
