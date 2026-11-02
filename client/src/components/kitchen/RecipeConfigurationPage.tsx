import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { showErrorToast, showInfoToast, showSuccessToast } from '../../utils/toast';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import SearchBar from '../common/SearchBar';

type Dish = {
  _id: string;
  name: string;
  code: string;
  isInventory?: boolean;
  price?: number;
  ptype?: string;
  variationValues?: Record<string, { productPrice: number }>;
  warehouse?: Record<
    string,
    {
      productPrice?: number;
      variationValues?: Record<string, { productPrice?: number }>;
    }
  >;
};

function getPrimaryWarehouse(dish: Dish | null): {
  productPrice?: number;
  variationValues?: Record<string, { productPrice?: number }>;
} | null {
  if (!dish?.warehouse || typeof dish.warehouse !== 'object') return null;
  const first = Object.values(dish.warehouse)[0];
  if (first && typeof first === 'object') return first;
  return null;
}

function sellingPriceForDish(
  dish: Dish | null,
  variationName: string
): number | undefined {
  if (!dish) return undefined;
  const wh = getPrimaryWarehouse(dish);
  const v = variationName.trim();
  if (v && wh?.variationValues?.[v]?.productPrice != null) {
    return Number(wh.variationValues[v].productPrice);
  }
  if (wh?.productPrice != null) return Number(wh.productPrice);
  if (v && dish.variationValues?.[v]?.productPrice != null) {
    return Number(dish.variationValues[v].productPrice);
  }
  if (dish.price != null) return Number(dish.price);
  return undefined;
}
type KitchenIng = {
  _id: string;
  name: string;
  unitId?: { shortName?: string; unitName?: string };
};

type IngRow = {
  kitchenProductId: string;
  quantity: string;
  unit: string;
  /** Search field label; cleared when user edits away from selected ingredient */
  ingQuery: string;
  /** Cost per unit from kitchen stock */
  cost?: number;
};

const emptyIngredientRow = (): IngRow => ({
  kitchenProductId: '',
  quantity: '0',
  unit: '',
  ingQuery: '',
  cost: 0
});

type RecipeIngPublic = {
  ingredientProductId?: string;
  ingredientName?: string;
  quantity?: number;
  unit?: string;
};

type RecipeListRow = {
  _id: string;
  productId: string;
  dishName?: string;
  dishCode?: string;
  variationName?: string;
  ingredients?: RecipeIngPublic[];
  recipeCost?: number;
  updatedAt?: string;
};

function parseRecipeIngredients(row: RecipeListRow): RecipeIngPublic[] {
  const raw = row.ingredients;
  if (!Array.isArray(raw)) return [];
  return raw.map((x: RecipeIngPublic) => {
    const q =
      typeof x.quantity === 'number' && !Number.isNaN(x.quantity)
        ? x.quantity
        : Number(x.quantity);
    return {
      ingredientProductId:
        typeof x.ingredientProductId === 'string' ? x.ingredientProductId : '',
      ingredientName: x.ingredientName,
      quantity: Number.isFinite(q) ? q : NaN,
      unit: x.unit
    };
  });
}

function kitchenUnitForIngredient(
  ingredientProductId: string,
  kitchenIngs: KitchenIng[]
): string {
  const k = kitchenIngs.find((i) => i._id === ingredientProductId);
  return k?.unitId?.shortName || k?.unitId?.unitName || '';
}

function recipeVariationKey(v: string | undefined | null): string {
  if (v == null) return '';
  return String(v).trim();
}

const RecipeConfigurationPage: React.FC = () => {
  const { currencyCode } = useCurrency();
  const [kitchenIngs, setKitchenIngs] = useState<KitchenIng[]>([]);
  const [dishId, setDishId] = useState('');
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [dishQuery, setDishQuery] = useState('');
  const [dishResults, setDishResults] = useState<Dish[]>([]);
  const [dishSearchLoading, setDishSearchLoading] = useState(false);
  const [dishListOpen, setDishListOpen] = useState(false);
  const dishSearchWrapRef = useRef<HTMLDivElement>(null);
  const ingWrapRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [ingOpenRow, setIngOpenRow] = useState<number | null>(null);
  /** Debounced hits from GET /kitchen/products?q= for active ingredient row */
  const [ingredientSuggestItems, setIngredientSuggestItems] = useState<KitchenIng[]>([]);
  const [ingredientSuggestLoading, setIngredientSuggestLoading] = useState(false);

  const [variationName, setVariationName] = useState('');
  const [rows, setRows] = useState<IngRow[]>([]);
  const [loadingKitchen, setLoadingKitchen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [recipesList, setRecipesList] = useState<RecipeListRow[]>([]);
  const [recipesListLoading, setRecipesListLoading] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [viewingRecipe, setViewingRecipe] = useState<RecipeListRow | null>(null);
  /** Row pending delete (keeps productId + variation for editor / modal sync). */
  const [pendingDeleteRecipe, setPendingDeleteRecipe] = useState<RecipeListRow | null>(
    null
  );
  /** True when GET returned a saved recipe with ingredients (show Update + Cancel). */
  const [recipeExistsInDb, setRecipeExistsInDb] = useState(false);
  const [revertTick, setRevertTick] = useState(0);
  const dishInputRef = useRef<HTMLInputElement>(null);
  const dishCardRef = useRef<HTMLDivElement>(null);
  /** Top dish search vs Saved recipes → Edit (controls whether existing recipe opens the form). */
  const recipeLoadIntentRef = useRef<'search' | 'edit' | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const variations = (() => {
    const wh = getPrimaryWarehouse(selectedDish);
    const vv = wh?.variationValues ?? selectedDish?.variationValues;
    if (!vv || typeof vv !== 'object') return [] as string[];
    return Object.keys(vv);
  })();

  const effectiveSellingPrice = sellingPriceForDish(selectedDish, variationName);

  const [viewModalDish, setViewModalDish] = useState<Dish | null>(null);
  const [viewModalDishLoading, setViewModalDishLoading] = useState(false);

  const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem('token');
    const h: Record<string, string> = {};
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  };

  const jsonHeaders = (): HeadersInit => {
    const token = localStorage.getItem('token');
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  };

  /** Deep link from Products: /kitchen/recipes?productId=… — open editor with dish pre-filled */
  useEffect(() => {
    const pid = searchParams.get('productId')?.trim();
    if (!pid) return;

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('productId');
        return next;
      },
      { replace: true }
    );

    recipeLoadIntentRef.current = 'edit';
    setDishId(pid);
    setDishListOpen(false);
    setIngOpenRow(null);
    setVariationName('');

    (async () => {
      try {
        const res = await fetch(`${api}/products/${pid}`, { headers: authHeaders() });
        const data = await res.json();
        if (res.ok && data.data) {
          const d = data.data as Dish;
          if (d.isInventory === true) {
            showErrorToast(
              'Recipes apply to finished products only (turn inventory tracking off for this dish).'
            );
            setSelectedDish(null);
            setDishId('');
            setDishQuery('');
            return;
          }
          setSelectedDish(d);
          setDishQuery(`${d.name} (${d.code})`);
          window.setTimeout(() => {
            dishCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        } else {
          showErrorToast(data?.message || 'Could not load product');
        }
      } catch (e) {
        showErrorToast((e as Error).message || 'Network error');
      }
    })();
  }, [searchParams, api, setSearchParams]);

  useEffect(() => {
    const run = async () => {
      setLoadingKitchen(true);
      try {
        // Kitchen inventory SKUs (ingredients for recipes) — same data as Kitchen inventory screen
        const kRes = await fetch(`${api}/kitchen/products`, { headers: authHeaders() });
        const kData = await kRes.json();
        if (kRes.ok && kData.data) {
          setKitchenIngs(kData.data as KitchenIng[]);
        }
      } catch {
        showErrorToast('Failed to load kitchen ingredients');
      } finally {
        setLoadingKitchen(false);
      }
    };
    run();
  }, [api]);

  const loadRecipesList = useCallback(
    async (q: string) => {
      setRecipesListLoading(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set('q', q.trim());
        const res = await fetch(`${api}/kitchen/recipes?${params}`, {
          headers: authHeaders()
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.data)) {
          setRecipesList(data.data as RecipeListRow[]);
        } else {
          setRecipesList([]);
        }
      } catch {
        setRecipesList([]);
      } finally {
        setRecipesListLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    loadRecipesList(listQuery);
  }, [listQuery, loadRecipesList]);

  useEffect(() => {
    if (!viewingRecipe) {
      setViewModalDish(null);
      setViewModalDishLoading(false);
      return;
    }
    let cancelled = false;
    setViewModalDishLoading(true);
    setViewModalDish(null);
    (async () => {
      try {
        const res = await fetch(`${api}/products/${viewingRecipe.productId}`, {
          headers: authHeaders()
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.data) {
          setViewModalDish(data.data as Dish);
        } else {
          setViewModalDish(null);
        }
      } catch {
        if (!cancelled) setViewModalDish(null);
      } finally {
        if (!cancelled) setViewModalDishLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewingRecipe, api]);

  useEffect(() => {
    const q = dishQuery.trim();
    if (!q) {
      setDishResults([]);
      setDishSearchLoading(false);
      return;
    }
    if (
      selectedDish &&
      q === `${selectedDish.name} (${selectedDish.code})`
    ) {
      setDishResults([]);
      setDishSearchLoading(false);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setDishSearchLoading(true);
      try {
        const params = new URLSearchParams({
          status: 'Active',
          isInventory: 'false',
          q
        });
        const res = await fetch(`${api}/products?${params}`, {
          headers: authHeaders()
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && Array.isArray(data.data)) {
          const prepared = (data.data as Dish[]).filter((d) => d.isInventory === false);
          prepared.sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', undefined, {
              sensitivity: 'base'
            })
          );
          setDishResults(prepared);
        } else {
          setDishResults([]);
        }
      } catch {
        if (!cancelled) setDishResults([]);
      } finally {
        if (!cancelled) setDishSearchLoading(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [dishQuery, api, selectedDish]);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const dishEl = dishSearchWrapRef.current;
      if (dishEl && !dishEl.contains(t)) setDishListOpen(false);
      if (ingOpenRow !== null) {
        const wrap = ingWrapRefs.current[ingOpenRow];
        if (wrap && !wrap.contains(t)) setIngOpenRow(null);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [ingOpenRow]);

  const onDishQueryChange = (v: string) => {
    setDishQuery(v);
    if (selectedDish) {
      recipeLoadIntentRef.current = null;
      setSelectedDish(null);
      setDishId('');
      setVariationName('');
      setRows([]);
      setIngOpenRow(null);
    }
    setDishListOpen(true);
  };

  const pickDish = (d: Dish) => {
    if (d.isInventory === true) {
      showErrorToast(
        'Only finished products (inventory off) can have recipes — not kitchen stock SKUs.'
      );
      return;
    }
    recipeLoadIntentRef.current = 'search';
    setSelectedDish(d);
    setDishId(d._id);
    setDishQuery(`${d.name} (${d.code})`);
    setDishResults([]);
    setDishListOpen(false);
    setVariationName('');
  };

  const clearDish = () => {
    recipeLoadIntentRef.current = null;
    setSelectedDish(null);
    setDishId('');
    setDishQuery('');
    setDishResults([]);
    setVariationName('');
    setRows([]);
    setIngOpenRow(null);
  };

  const startNewRecipe = () => {
    clearDish();
    dishCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => dishInputRef.current?.focus(), 350);
  };

  const cancelRecipeEdit = () => {
    if (!dishId) return;
    setRevertTick((n) => n + 1);
  };

  const confirmDeleteRecipe = async () => {
    const target = pendingDeleteRecipe;
    if (!target) return;
    setLoading(true);
    try {
      const res = await fetch(`${api}/kitchen/recipes/${target._id}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.message || 'Failed to delete recipe');
        return;
      }
      showSuccessToast(data.message || 'Recipe deleted');
      setPendingDeleteRecipe(null);

      if (viewingRecipe?._id === target._id) {
        setViewingRecipe(null);
      }

      const deletedVar = recipeVariationKey(target.variationName);
      const editorVar = recipeVariationKey(variationName);
      const deletedMatchesEditor =
        dishId === target.productId && deletedVar === editorVar;
      if (deletedMatchesEditor) {
        clearDish();
      } else if (dishId === target.productId) {
        /** Same dish, different variation — reload recipe for current variation from API. */
        setRevertTick((n) => n + 1);
      }

      setListQuery('');
      await loadRecipesList('');
    } catch (e) {
      showErrorToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openEditorForRecipe = async (row: RecipeListRow) => {
    recipeLoadIntentRef.current = 'edit';
    const pid = row.productId;
    const vname =
      row.variationName != null && String(row.variationName).trim() !== ''
        ? String(row.variationName)
        : '';
    setDishId(pid);
    setDishQuery(
      row.dishName && row.dishCode
        ? `${row.dishName} (${row.dishCode})`
        : row.dishName || pid
    );
    setVariationName(vname);
    setDishListOpen(false);
    setIngOpenRow(null);
    try {
      const res = await fetch(`${api}/products/${pid}`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok && data.data) {
        setSelectedDish(data.data as Dish);
      } else {
        setSelectedDish(null);
      }
    } catch {
      setSelectedDish(null);
    }
  };

  useEffect(() => {
    if (!dishId) {
      setRows([]);
      setIngOpenRow(null);
      setRecipeExistsInDb(false);
      return;
    }
    const loadRecipe = async () => {
      setIngOpenRow(null);
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (variationName) params.set('variationName', variationName);
        const qs = params.toString();
        const res = await fetch(
          `${api}/kitchen/recipes/${dishId}${qs ? `?${qs}` : ''}`,
          { headers: authHeaders() }
        );
        const data = await res.json();
        if (!res.ok) {
          recipeLoadIntentRef.current = null;
          showErrorToast(data?.message || 'Failed to load recipe');
          return;
        }
        const r = data.data;
        if (!r?.ingredients?.length) {
          setRecipeExistsInDb(false);
          setRows([emptyIngredientRow()]);
          recipeLoadIntentRef.current = null;
          return;
        }
        if (recipeLoadIntentRef.current === 'search') {
          recipeLoadIntentRef.current = null;
          showInfoToast(
            'A recipe already exists for this dish. Find it in Saved recipes below and use Edit to change it.'
          );
          setSelectedDish(null);
          setDishId('');
          setDishQuery('');
          setVariationName('');
          setRows([]);
          setRecipeExistsInDb(false);
          setIngOpenRow(null);
          return;
        }
        recipeLoadIntentRef.current = null;
        setRecipeExistsInDb(true);
        setRows(
          r.ingredients.map((ing: any) => {
            const kp = ing.kitchenProductId;
            const kid =
              ing.ingredientProductId ??
              (typeof kp === 'object' && kp?._id ? kp._id : kp);
            const idStr = String(kid ?? '');
            const u =
              ing.unit ||
              (typeof kp === 'object' && kp?.unitId?.shortName ? kp.unitId.shortName : '');
            const ingQuery =
              typeof kp === 'object' && kp != null && (kp as { name?: string }).name
                ? `${(kp as { name: string }).name} (${u || (kp as { unitId?: { shortName?: string } }).unitId?.shortName || '—'})`
                : '';
            const qRaw = ing.quantity;
            const qNum =
              typeof qRaw === 'number' && Number.isFinite(qRaw)
                ? qRaw
                : parseFloat(String(qRaw));
            const qtyStr =
              Number.isFinite(qNum) && qNum > 0 ? String(qNum) : '0';
            return {
              kitchenProductId: idStr,
              quantity: qtyStr,
              unit: u,
              ingQuery
            };
          })
        );
      } catch {
        recipeLoadIntentRef.current = null;
        showErrorToast('Network error');
      } finally {
        setLoading(false);
      }
    };
    loadRecipe();
  }, [api, dishId, variationName, revertTick]);

  useEffect(() => {
    if (!kitchenIngs.length) return;
    setRows((prev) =>
      prev.map((row) => {
        if (!row.kitchenProductId || row.ingQuery.trim()) return row;
        const k = kitchenIngs.find((x) => x._id === row.kitchenProductId);
        if (!k) return row;
        return {
          ...row,
          ingQuery: `${k.name} (${k.unitId?.shortName || '—'})`,
          unit: row.unit || k.unitId?.shortName || ''
        };
      })
    );
  }, [kitchenIngs]);

  const unitForKitchenId = (id: string) => {
    const k = kitchenIngs.find((x) => x._id === id);
    return k?.unitId?.shortName || '';
  };

  const kitchenLabel = (k: KitchenIng) =>
    `${k.name} (${k.unitId?.shortName || '—'})`;

  const filterKitchenForQuery = useCallback((q: string) => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return kitchenIngs
      .filter(
        (k) =>
          k.name.toLowerCase().includes(s) ||
          (k.unitId?.shortName || '').toLowerCase().includes(s)
      )
      .slice(0, 50);
  }, [kitchenIngs]);

  useEffect(() => {
    if (ingOpenRow === null) {
      setIngredientSuggestItems([]);
      setIngredientSuggestLoading(false);
      return;
    }
    const row = rows[ingOpenRow];
    if (!row) {
      setIngredientSuggestItems([]);
      setIngredientSuggestLoading(false);
      return;
    }
    const q = row.ingQuery.trim();
    if (!q) {
      setIngredientSuggestLoading(false);
      setIngredientSuggestItems(kitchenIngs.slice(0, 60));
      return;
    }

    setIngredientSuggestItems([]);
    setIngredientSuggestLoading(true);
    let cancelled = false;
    const ac = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `${api}/kitchen/products?${new URLSearchParams({ q })}`,
          { headers: authHeaders(), signal: ac.signal }
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && Array.isArray(data.data)) {
          setIngredientSuggestItems(data.data as KitchenIng[]);
        } else {
          setIngredientSuggestItems(filterKitchenForQuery(q));
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError' || cancelled) return;
        setIngredientSuggestItems(filterKitchenForQuery(q));
      } finally {
        if (!cancelled) setIngredientSuggestLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      ac.abort();
      window.clearTimeout(t);
    };
  }, [ingOpenRow, rows, kitchenIngs, api, filterKitchenForQuery]);

  const onIngQueryChange = (i: number, v: string) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[i], ingQuery: v };
      if (row.kitchenProductId) {
        const match = kitchenIngs.find((x) => x._id === row.kitchenProductId);
        const expected = match ? kitchenLabel(match) : '';
        if (expected && v !== expected) {
          row.kitchenProductId = '';
          row.unit = '';
        }
      }
      next[i] = row;
      return next;
    });
    setIngOpenRow(i);
  };

  const pickKitchenIng = (i: number, k: KitchenIng) => {
    setRows((prev) => {
      const dup = prev.some((r, j) => j !== i && r.kitchenProductId === k._id);
      if (dup) {
        showErrorToast('This ingredient is already in the recipe');
        return prev;
      }
      const next = [...prev];
      const prevQ = parseFloat(next[i].quantity);
      const keepQty = Number.isFinite(prevQ) && prevQ > 0;
      next[i] = {
        ...next[i],
        kitchenProductId: k._id,
        unit: k.unitId?.shortName || '',
        ingQuery: kitchenLabel(k),
        quantity: keepQty ? next[i].quantity : '0'
      };
      return next;
    });
    setIngOpenRow(null);
  };

  const updateRow = (i: number, patch: Partial<IngRow>) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      if (patch.kitchenProductId !== undefined) {
        next[i].unit = unitForKitchenId(patch.kitchenProductId);
      }
      return next;
    });
  };

  const addRow = () => setRows((r) => [...r, emptyIngredientRow()]);

  const removeRow = (i: number) => {
    setIngOpenRow(null);
    setRows((r) => (r.length <= 1 ? r : r.filter((_, j) => j !== i)));
  };

  const ingredientMatchesForRow = (i: number, row: IngRow): KitchenIng[] => {
    if (ingOpenRow !== i || !dishId || loadingKitchen) return [];

    /** IDs already committed to other rows — exclude them from suggestions */
    const usedIds = new Set(
      rows
        .filter((r, j) => j !== i && r.kitchenProductId)
        .map((r) => r.kitchenProductId)
    );
    const excludeUsed = (items: KitchenIng[]) =>
      items.filter((k) => !usedIds.has(k._id));

    const q = row.ingQuery.trim();
    if (!q) {
      const base =
        ingredientSuggestItems.length > 0
          ? ingredientSuggestItems
          : kitchenIngs.slice(0, 60);
      return excludeUsed(base);
    }
    if (ingredientSuggestLoading && ingredientSuggestItems.length === 0) {
      return excludeUsed(filterKitchenForQuery(row.ingQuery));
    }
    return excludeUsed(
      ingredientSuggestItems.length > 0
        ? ingredientSuggestItems
        : filterKitchenForQuery(row.ingQuery)
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dishId) {
      showErrorToast('Select a dish');
      return;
    }
    for (const row of rows) {
      if (!row.kitchenProductId) continue;
      const q = parseFloat(row.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        showErrorToast('Each ingredient needs a quantity greater than 0');
        return;
      }
    }
    const ingredients = rows
      .filter((row) => row.kitchenProductId)
      .map((row) => ({
        kitchenProductId: row.kitchenProductId,
        quantity: parseFloat(row.quantity),
        unit: (row.unit || unitForKitchenId(row.kitchenProductId)).trim().toLowerCase()      }));
    if (!ingredients.length) {
      showErrorToast('Add at least one ingredient with quantity');
      return;
    }
    const kidSet = new Set(ingredients.map((x) => x.kitchenProductId));
    if (kidSet.size !== ingredients.length) {
      showErrorToast('Each ingredient can only appear once in the recipe');
      return;
    }
    for (const ing of ingredients) {
      if (!ing.unit) {
        showErrorToast('Each ingredient needs a unit matching the kitchen product');
        return;
      }
    }
    const wasUpdate = recipeExistsInDb;
    setLoading(true);
    try {
      const res = await fetch(`${api}/kitchen/recipes`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          productId: dishId,
          variationName: variationName.trim() || null,
          ingredients: ingredients.map((x) => ({
            ingredientProductId: x.kitchenProductId,
            quantity: x.quantity,
            unit: x.unit
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.message || 'Save failed');
        return;
      }
      setRecipeExistsInDb(true);
      showSuccessToast(
        data.message || (wasUpdate ? 'Recipe updated' : 'Recipe saved')
      );
      loadRecipesList(listQuery);
    } catch (err) {
      showErrorToast((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const viewModalSellingPrice =
    viewingRecipe != null
      ? sellingPriceForDish(
          viewModalDish,
          viewingRecipe.variationName != null
            ? String(viewingRecipe.variationName).trim()
            : ''
        )
      : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100/90 via-white to-slate-50 p-4 sm:p-8">
      {(loadingKitchen || loading) && <Loader text="Loading" />}
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 sm:mb-10">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="inline-flex items-center rounded-full bg-[#003366]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#003366]">
              Kitchen
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Recipe configuration
          </h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base text-slate-600 leading-relaxed">
            Link prepared dishes to kitchen stock. Quantities are per portion; units follow{' '}
            <span className="font-medium text-slate-800">Kitchen inventory</span>.
          </p>
        </header>

        <form onSubmit={save} className="space-y-8">
          <div
            ref={dishCardRef}
            id="recipe-dish-card"
            className="group relative rounded-2xl border border-slate-200/80 bg-white/90 shadow-xl shadow-slate-200/50 backdrop-blur-sm scroll-mt-6 overflow-visible"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-1 overflow-hidden rounded-t-2xl">
              <div className="h-full w-full bg-gradient-to-r from-[#003366] via-sky-600 to-[#003366] opacity-90" />
            </div>
            <div className="relative z-10 p-6 sm:p-8">
              <div ref={dishSearchWrapRef} className="relative z-20 max-w-xl">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[#003366]">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                  Prepared product (dish)
                </label>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <input
                      ref={dishInputRef}
                      type="text"
                      value={dishQuery}
                      onChange={(e) => onDishQueryChange(e.target.value)}
                      onFocus={() => setDishListOpen(true)}
                      placeholder="e.g. grilled chicken, SKU…"
                      autoComplete="off"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 shadow-inner shadow-slate-200/30 transition-all placeholder:text-slate-400 focus:border-[#003366]/40 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#003366]/15"
                    />
                    {dishSearchLoading && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                        Searching…
                      </span>
                    )}
                  </div>
                  {dishId && (
                    <button
                      type="button"
                      onClick={clearDish}
                      className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {dishListOpen && dishQuery.trim() && (
                  <div className="absolute left-0 right-0 z-[200] mt-2 max-h-72 w-full min-w-0 overflow-auto rounded-xl border border-slate-200/80 bg-white py-1 shadow-2xl shadow-slate-300/40 ring-1 ring-black/5">
                    {dishResults.length === 0 && !dishSearchLoading ? (
                      <div className="px-4 py-5 text-sm text-slate-500">
                        No prepared dishes match &quot;{dishQuery.trim()}&quot;.
                      </div>
                    ) : (
                      dishResults.map((d) => (
                        <button
                          key={d._id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickDish(d)}
                          className="w-full text-left px-4 py-3 text-sm transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0"
                        >
                          <span className="font-semibold text-slate-900">{d.name}</span>
                          <span className="text-slate-500 ml-2 font-mono text-xs">{d.code}</span>
                          {d.ptype === 'Variation' && (
                            <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                              variation
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-xl shadow-slate-200/50 backdrop-blur-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white p-6 sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Saved recipes</h2>
                  <p className="mt-1.5 max-w-lg text-sm text-slate-600 leading-relaxed">
                    Browse and manage saved formulas. Units resolve from{' '}
                    <strong className="font-semibold text-slate-800">Kitchen inventory</strong>.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadRecipesList(listQuery)}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300"
                  >
                    <svg className="mr-2 h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={startNewRecipe}
                    className="inline-flex items-center rounded-xl bg-[#003366] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#003366]/30 transition-all hover:bg-[#004080] hover:shadow-xl hover:shadow-[#003366]/25"
                  >
                    <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add recipe
                  </button>
                </div>
              </div>
              <div className="mt-6 max-w-xl">
                <SearchBar
                  onSearch={setListQuery}
                  placeholder="Search saved recipes by dish name or code…"
                  className="w-full"
                  inputClassName="rounded-xl border-slate-200 bg-slate-50/80 py-3 shadow-sm focus:bg-white"
                />
              </div>
            </div>

            {recipesListLoading ? (
              <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm font-medium text-slate-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#003366]" />
                Loading recipes…
              </div>
            ) : recipesList.length === 0 ? (
              <div className="mx-6 my-10 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
                <p className="text-sm text-slate-600">
                  No recipes match your filters. Use{' '}
                  <strong className="text-slate-800">Add recipe</strong> or save from the editor below.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto p-4 sm:p-6">
                <div className="overflow-hidden rounded-xl border border-slate-100 shadow-inner shadow-slate-100">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-50 to-slate-100/80">
                        <th className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Dish name
                        </th>
                        <th className="px-5 py-4 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Ingredients
                        </th>
                        <th className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Quantity
                        </th>
                        <th className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Unit
                        </th>
                        <th className="px-5 py-4 text-right text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {recipesList.map((r) => {
                        const ings = parseRecipeIngredients(r);
                        return (
                          <tr
                            key={r._id}
                            className="transition-colors hover:bg-slate-50/90"
                          >
                            <td className="px-5 py-5 align-top">
                              <div className="text-base font-bold text-slate-900">
                                {r.dishName || '—'}
                                {r.dishCode ? (
                                  <span className="text-slate-500 font-semibold font-mono text-sm">
                                    {' '}
                                    ({r.dishCode})
                                  </span>
                                ) : null}
                              </div>
                              {r.variationName ? (
                                <div className="mt-2 inline-flex items-center rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200/60">
                                  {r.variationName}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-5 py-5 text-center align-top">
                              <span className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full bg-slate-100 px-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200/80">
                                {ings.length}
                              </span>
                            </td>
                            <td className="px-5 py-5 align-top">
                              <div className="space-y-1.5 text-sm font-medium text-slate-800">
                                {ings.length === 0 ? (
                                  <span className="text-slate-400">—</span>
                                ) : (
                                  ings.map((ing, idx) => (
                                    <div key={`${r._id}-q-${idx}`} className="tabular-nums">
                                      {Number.isFinite(ing.quantity) ? ing.quantity : '—'}
                                    </div>
                                  ))
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-5 align-top">
                              <div className="space-y-1.5 text-sm text-slate-600">
                                {ings.length === 0 ? (
                                  <span className="text-slate-400">—</span>
                                ) : (
                                  ings.map((ing, idx) => {
                                    const kid = ing.ingredientProductId || '';
                                    const fromKitchen = kid
                                      ? kitchenUnitForIngredient(kid, kitchenIngs)
                                      : '';
                                    const u = fromKitchen || ing.unit || '—';
                                    return (
                                      <div key={`${r._id}-u-${idx}`}>
                                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-600">
                                          {u}
                                        </span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-5 whitespace-nowrap text-right align-top">
                              <div className="inline-flex items-center gap-0.5 rounded-xl bg-slate-100/80 p-1 ring-1 ring-slate-200/60">
                                <button
                                  type="button"
                                  onClick={() => setViewingRecipe(r)}
                                  className="inline-flex items-center rounded-lg p-2 text-emerald-600 transition-colors hover:bg-white hover:text-emerald-700 hover:shadow-sm"
                                  title="View recipe"
                                >
                                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditorForRecipe(r)}
                                  className="inline-flex items-center rounded-lg p-2 text-[#003366] transition-colors hover:bg-white hover:shadow-sm"
                                  title="Edit recipe"
                                >
                                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteRecipe(r)}
                                  className="inline-flex items-center rounded-lg p-2 text-red-600 transition-colors hover:bg-white hover:text-red-700 hover:shadow-sm"
                                  title="Delete recipe"
                                >
                                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {dishId && (
            <div className="space-y-6 rounded-2xl border border-slate-200/80 bg-white/90 p-6 sm:p-8 shadow-xl shadow-slate-200/50 backdrop-blur-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Recipe editor</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Per portion — link kitchen SKUs and quantities</p>
                </div>
              </div>
          {variations.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">
                Portion / variation <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <select
                value={variationName}
                onChange={(e) => setVariationName(e.target.value)}
                className="w-full max-w-xl rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition-all focus:border-[#003366]/40 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#003366]/15"
              >
                <option value="">Default recipe (no variation)</option>
                {variations.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                Save a separate recipe per size (e.g. Small / Large) when the dish has variations on the POS.
              </p>
            </div>
          )}

              <div className="border-t border-slate-100 pt-6">
                <div className="mb-4">
                  <span className="text-base font-bold text-slate-900">
                    Ingredients (per 1 portion)
                  </span>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Type to search kitchen stock (live query). Pick a row below or add another line.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-100/90 text-left text-xs font-bold uppercase tracking-wide text-slate-600">
                          <th className="px-3 py-3 sm:px-4">Ingredient</th>
                          <th className="px-3 py-3 w-[6.5rem] sm:px-4">Quantity</th>
                          <th className="px-3 py-3 w-[5rem] sm:px-4">Unit</th>
                          <th className="px-3 py-3 w-[4.5rem] text-right sm:px-4">
                            Remove
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {rows.map((row, i) => {
                          const ingMatches = ingredientMatchesForRow(i, row);
                          const showSuggest =
                            ingOpenRow === i && Boolean(dishId) && !loadingKitchen;
                          return (
                            <tr
                              key={i}
                              className="border-b border-slate-100 align-top last:border-0"
                            >
                              <td className="px-3 py-3 sm:px-4">
                                <div
                                  ref={(el) => {
                                    ingWrapRefs.current[i] = el;
                                  }}
                                  className="relative min-w-[11rem]"
                                >
                                  <input
                                    type="text"
                                    value={row.ingQuery}
                                    aria-label={`Ingredient row ${i + 1}`}
                                    onChange={(e) => onIngQueryChange(i, e.target.value)}
                                    onFocus={() => setIngOpenRow(i)}
                                    placeholder="Search kitchen products…"
                                    autoComplete="off"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-[#003366]/40 focus:outline-none focus:ring-2 focus:ring-[#003366]/12"
                                  />
                                  {showSuggest ? (
                                    <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-52 overflow-auto rounded-lg border border-slate-200/80 bg-white py-1 shadow-xl ring-1 ring-black/5">
                                      {ingredientSuggestLoading &&
                                      row.ingQuery.trim() &&
                                      ingMatches.length === 0 ? (
                                        <div className="px-3 py-2.5 text-xs font-medium text-slate-500">
                                          Searching…
                                        </div>
                                      ) : null}
                                      {row.ingQuery.trim() &&
                                      !ingredientSuggestLoading &&
                                      ingMatches.length === 0 ? (
                                        <div className="px-3 py-2.5 text-sm text-slate-500">
                                          No ingredients match &quot;{row.ingQuery.trim()}&quot;.
                                        </div>
                                      ) : null}
                                      {ingMatches.map((k) => (
                                        <button
                                          key={k._id}
                                          type="button"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => pickKitchenIng(i, k)}
                                          className="w-full border-b border-slate-50 px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-slate-50"
                                        >
                                          <span className="font-semibold text-slate-900">
                                            {k.name}
                                          </span>
                                          <span className="ml-2 font-mono text-xs text-slate-500">
                                            {k.unitId?.shortName || '—'}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-3 py-3 sm:px-4">
                                <input
                                  type="number"
                                  step="any"
                                  min={0.0001}
                                  value={row.quantity}
                                  aria-label={`Quantity row ${i + 1}`}
                                  onChange={(e) =>
                                    updateRow(i, { quantity: e.target.value })
                                  }
                                  className="w-full min-w-[4.5rem] rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm tabular-nums shadow-sm focus:border-[#003366]/40 focus:outline-none focus:ring-2 focus:ring-[#003366]/12"
                                />
                              </td>
                              <td className="px-3 py-3 sm:px-4">
                                <input
                                  readOnly
                                  aria-label={`Unit row ${i + 1}`}
                                  value={
                                    row.unit || unitForKitchenId(row.kitchenProductId)
                                  }
                                  className="w-full min-w-[3rem] rounded-lg border border-slate-200 bg-slate-50/90 px-2 py-2 text-sm font-medium text-slate-600"
                                />
                              </td>
                              <td className="px-3 py-3 text-right sm:px-4">
                                <button
                                  type="button"
                                  onClick={() => removeRow(i)}
                                  className="rounded-lg px-2 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={addRow}
                    className="inline-flex items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-4 py-2.5 text-sm font-semibold text-[#003366] transition-all hover:border-[#003366]/35 hover:bg-white"
                  >
                    <svg
                      className="mr-1.5 h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    Add ingredient
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
                <button
                  type="button"
                  onClick={cancelRecipeEdit}
                  className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#003366] px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-[#003366]/30 transition-all hover:bg-[#004080] hover:shadow-xl"
                >
                  {recipeExistsInDb ? 'Update recipe' : 'Save recipe'}
                </button>
              </div>
            </div>
          )}
        </form>

        {pendingDeleteRecipe && (
          <DeleteConfirmModal
            itemName={pendingDeleteRecipe.dishName || pendingDeleteRecipe.dishCode || 'Recipe'}
            onCancel={() => setPendingDeleteRecipe(null)}
            onConfirm={confirmDeleteRecipe}
          />
        )}

        {viewingRecipe && (
          <div
            className="fixed inset-0 z-50 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recipe-view-title"
          >
            <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
              <div
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-[10px]"
                aria-hidden
                onClick={() => setViewingRecipe(null)}
              />
              <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200/90 bg-white text-left shadow-[0_25px_80px_-12px_rgba(15,23,42,0.35)] ring-1 ring-black/5">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#003366]/[0.06] via-transparent to-sky-500/[0.05]" />
                <div className="relative h-1.5 bg-gradient-to-r from-[#003366] via-sky-500 to-[#003366]" />
                <div className="relative">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-100/90 px-6 pb-5 pt-6 sm:px-8 sm:pt-8">
                    <div className="flex min-w-0 flex-1 gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#003366] to-sky-800 text-white shadow-lg shadow-[#003366]/35">
                        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.75}
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                        </svg>
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                          Recipe preview
                        </p>
                        <h3
                          id="recipe-view-title"
                          className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
                        >
                          {viewingRecipe.dishName || 'Recipe'}
                        </h3>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {viewingRecipe.dishCode ? (
                            <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-700 ring-1 ring-slate-200/80">
                              {viewingRecipe.dishCode}
                            </span>
                          ) : null}
                          {viewingRecipe.variationName ? (
                            <span className="inline-flex items-center rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 px-2.5 py-1 text-xs font-semibold text-amber-950 ring-1 ring-amber-200/70">
                              {viewingRecipe.variationName}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewingRecipe(null)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                      aria-label="Close"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="px-6 py-5 sm:px-8">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                          />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-900">Ingredients</p>
                        <p className="text-xs text-slate-500">
                          Per portion · units from{' '}
                          <span className="font-semibold text-slate-600">Kitchen inventory</span>
                        </p>
                      </div>
                    </div>

                    <ul className="max-h-[min(22rem,50vh)] space-y-2.5 overflow-y-auto pr-1">
                      {parseRecipeIngredients(viewingRecipe).length === 0 ? (
                        <li className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-10 text-center text-sm text-slate-500">
                          No ingredients in this recipe
                        </li>
                      ) : null}
                      {parseRecipeIngredients(viewingRecipe).map((ing, idx) => {
                        const kid = ing.ingredientProductId || '';
                        const ku = kid ? kitchenUnitForIngredient(kid, kitchenIngs) : '';
                        const unitDisp = ku || ing.unit || '—';
                        const name = ing.ingredientName || kid || 'Ingredient';
                        return (
                          <li
                            key={idx}
                            className="group flex items-stretch gap-3 rounded-2xl border border-slate-100 bg-gradient-to-r from-white to-slate-50/40 p-4 shadow-sm ring-1 ring-slate-100/80 transition-all hover:border-slate-200/90 hover:shadow-md"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600 transition-colors group-hover:bg-[#003366]/10 group-hover:text-[#003366]">
                              {idx + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold leading-snug text-slate-900">{name}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-lg font-bold tabular-nums leading-none text-slate-900">
                                {Number.isFinite(ing.quantity) ? ing.quantity : '—'}
                              </p>
                              <p className="mt-1.5 inline-block rounded-md bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                {unitDisp}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="border-t border-slate-100 bg-gradient-to-br from-slate-50 via-white to-slate-50/80 px-6 py-6 sm:px-8">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                      Selling price
                    </p>
                    {viewModalDishLoading ? (
                      <div className="mt-3 h-11 w-52 max-w-full animate-pulse rounded-xl bg-slate-200/80" />
                    ) : viewModalSellingPrice !== undefined ? (
                      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-[#003366] sm:text-4xl">
                        {currencyCode} {viewModalSellingPrice.toFixed(2)}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm font-medium text-slate-500">
                        No POS price set for this dish or variation.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {dishId && effectiveSellingPrice !== undefined && (
          <div
            className="recipe-costing-summary-root group relative mt-10 overflow-hidden rounded-2xl border border-[#003366]/18 bg-gradient-to-br from-[#003366]/[0.09] via-white to-slate-50 p-6 shadow-xl shadow-[#003366]/12 ring-1 ring-[#003366]/10 transition-all duration-500 ease-out hover:border-[#003366]/28 hover:shadow-2xl hover:shadow-[#003366]/18 sm:p-8"
            role="region"
            aria-label="Recipe costing summary"
          >
            <div
              className="recipe-costing-orb pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[#003366]/15 blur-3xl"
              aria-hidden
            />
            <div
              className="recipe-costing-orb--alt pointer-events-none absolute -bottom-28 -left-16 h-52 w-52 rounded-full bg-[#0a4f7a]/20 blur-3xl"
              aria-hidden
            />

            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-stretch lg:justify-between lg:gap-10">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#003366] text-white shadow-lg shadow-[#003366]/35 ring-2 ring-white/30 transition-transform duration-300 ease-out group-hover:scale-[1.04] group-hover:shadow-xl group-hover:shadow-[#003366]/45">
                  <svg
                    className="h-7 w-7"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.75}
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="min-w-0 pt-0.5">
                  <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-[#003366]/80">
                    Recipe costing summary
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Selling price from POS for this dish
                    {variationName.trim() ? (
                      <span className="font-semibold text-slate-800">
                        {' '}
                        · {variationName.trim()}
                      </span>
                    ) : null}
                    .
                  </p>
                </div>
              </div>

              <div className="relative w-full shrink-0 lg:max-w-sm">
                <div className="relative overflow-hidden rounded-2xl border border-[#003366]/22 bg-white/95 p-6 shadow-inner shadow-[#003366]/[0.08] backdrop-blur-sm transition-all duration-300 group-hover:border-[#003366]/32 group-hover:bg-white group-hover:shadow-md">
                  <div className="recipe-costing-price-shine" aria-hidden />
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Selling price
                  </p>
                  <p className="mt-3 bg-gradient-to-r from-[#003366] via-[#0a4f7a] to-[#003366] bg-clip-text text-3xl font-bold tabular-nums tracking-tight text-transparent transition-transform duration-300 ease-out group-hover:scale-[1.02] sm:text-4xl">
                    {currencyCode} {effectiveSellingPrice.toFixed(2)}
                  </p>
                  <div
                    className="mt-5 h-1 overflow-hidden rounded-full bg-slate-100"
                    aria-hidden
                  >
                    <div className="recipe-costing-bar-glow h-full w-full rounded-full bg-gradient-to-r from-[#003366]/25 via-[#003366]/55 to-[#0a4f7a]/40 motion-reduce:scale-x-100 motion-reduce:opacity-100" />
                  </div>
                  <p className="mt-3 text-[11px] font-medium text-slate-500">
                    Menu price for the selected dish{variationName.trim() ? ' & variation' : ''}.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipeConfigurationPage;
