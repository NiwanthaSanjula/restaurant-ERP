# New Dish: one prepared serving

**Products → POS Products → New Dish** guides staff through:

1. Name, SKU, existing category, serving unit, active selling location, selling price and recorded cost per serving. The current product model requires a cost; this flow asks for it rather than deriving a new financial cost. **Save dish & continue to recipe** creates a Single, Sellable, prepared (`isInventory: false`) Product with **Pending** status.
2. Choose existing kitchen ingredients and enter their quantities for one serving. Units are fixed to each ingredient's kitchen unit. **Save recipe & review** uses the existing recipe API and leaves the product Pending.
3. **Activate dish** uses the existing product update API. The server checks the guided dish's selling fields/location and saved recipe, including positive quantities, existing ingredients and matching units, before allowing Active status. Then staff can open POS at that selling location.

The product API accepts an optional `dishDraftRequestId` only for this guided workflow. An actor-scoped deterministic Product `_id` and protected draft metadata make creation retries return the same record, including an uncertain creation response. Existing unique SKU/name checks remain. There is no new collection/index or migration.

The browser stores the draft and exact creation request per account before posting. Failed recipe saves retain the created Product ID and entered quantities, including after reload. Retry saves the recipe for that same product; it does not create another Product. POS Products also exposes **Resume dish** for Pending guided dishes. The existing recipe editor remains available via **Open existing recipe editor** and the normal product recipe action.

Staff need an existing category, serving unit, active selling location, kitchen ingredients with recipe units, and the existing product/recipe permissions. Empty ingredient setup links to Add a kitchen ingredient and offers Reload setup. Ingredient stock is separate: a recipe save adds no stock, and sufficient Kitchen Stock is required before selling. Variants, tickets and pack conversion are outside this flow.

Focused checks: `npm test -- --runInBand src/routes/posCheckout.test.ts src/services/dishDraftClient.test.ts`. The isolated Fried Rice fixture stays out of POS while Pending, resumes after a failed recipe save, activates at its selected location, and consumes **150 g** from **1,000 g → 850 g** when one serving is sold. Replaying that checkout leaves **850 g** and one sale/movement. No configured database writes are part of verification.
