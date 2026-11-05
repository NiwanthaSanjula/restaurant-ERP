# Product selling types

`Product.isInventory` selects stock tracking (warehouse SKU versus a prepared
dish consuming a recipe). It does **not** say whether an item can be sold.
`Product.isSellable` is a separate boolean. New generic product requests must
choose it explicitly; omitted fields on updates preserve the stored value.

POS catalog/search/barcode and checkout accept only `status: Active` and
`isSellable: true`. New sales through the legacy sales endpoint also reject
inventory-only/unclassified items. Replaying an already completed checkout
still returns its original sale, without another deduction.

POS Products (`/pos-products`) lists Sellable records. Inventory Items
(`/inventory-items`) lists Inventory only records, with a Needs Review view
at `/inventory-items/needs-review`. Each Add button uses the same product
form, defaulting its selling type from the route; stock tracking is separate
and remains available for sellable bottled drinks. Purchases, stock and recipe
selectors retain their existing unfiltered product contract. No classification
is inferred from names, categories, stock tracking or prices.

Old `/viewProducts` bookmarks redirect to POS Products; `/createProduct`
redirects to its create form. Existing `/editProduct/:id` links still work.
Successful full saves and classification-only saves return to the list matching
the saved selling type. Failed saves remain on the form. Both lists, their
create forms and edit forms retain `manageProducts:read/create/update` guards.
The shared forms expose the existing Pending/Active/Inactive status. Creation
still defaults to Pending; explicitly choose Active for POS availability.
Classification-only saves preserve status and all stock details.

KitchenInventoryProduct is a separate ingredient record, always Inventory only
(including old records without the new field). Creating one cannot add a POS
product. Its optional `inventoryProductId` links an existing warehouse SKU;
linking does not rewrite that product's selling classification or stock.

## Existing records requiring review

Read-only inspection of the configured database on 2026-11-04 found five
products, all lacking an explicit selling type, and zero kitchen ingredients.
None was reclassified. They will be excluded from POS until reviewed.

| Exact SKU | Existing name | Current classification |
| --- | --- | --- |
| PRIMA-APF-25KG | Prima All-Purpose Flour (25kg Bag) | Needs review |
| ARAL-KS-50KG | Araliya Keeri Samba Rice (50kg) | Needs review |
| ARAL-SAM-50KG | Araliya Nadu/Samba Rice (50kg) | Needs review |
| BAI-WC-1KG | Bairaha Broiler Whole Chicken (Frozen, 1kg) | Needs review |
| BAI-BLB-2KG | Bairaha Boneless Chicken Breast (2kg Pack) | Needs review |

To classify: Inventory Items → Needs Review → search exact SKU → Edit
→ Selling type → Inventory only or Sellable → **Save selling type only**.
This sends only `isSellable`; it does not rewrite quantities, IDs, warehouse
data, recipes or purchase references. Leave the separate inventory-tracking
setting unchanged. Existing product update permissions still apply.

Prepared dishes and bottled drinks intended for sale should explicitly choose
Sellable. Inventory-only products can still be linked to kitchen ingredients
and purchased. This implementation performs no migration or database writes.
