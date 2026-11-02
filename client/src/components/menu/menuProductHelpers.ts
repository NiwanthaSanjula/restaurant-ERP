type ProductVariation = {
  productPrice?: number | null;
  productQty?: number | null;
};

type ProductValues<T> = Map<string, T> | Record<string, T>;

type ProductBatch = ProductVariation & {
  variationValues?: ProductValues<ProductVariation | null>;
};

type ProductWarehouse = ProductBatch & {
  warehouseName?: string;
  batches?: (ProductBatch | null)[];
};

type ProductReference = string | { name?: string; _id?: string };

/** Fields used by the menu, based on the product list and product API model. */
export type ProductRow = {
  id: string;
  name: string;
  code: string;
  brand?: ProductReference;
  category?: ProductReference;
  image?: string;
  unit: string;
  saleUnit?: string;
  ptype: 'Single' | 'Variation';
  status: 'Pending' | 'Active' | 'Inactive';
  createdAt: string;
  warehouse?: ProductValues<ProductWarehouse | null>;
  variation?: string;
  price?: number;
  inStock?: number;
  isInventory?: boolean;
};

type ApiProduct = Omit<ProductRow, 'id' | 'price' | 'inStock'> & { _id: string };

/** Fields read by the menu picker and cart. */
export type MenuVariationOption = {
  key: string;
  label: string;
  price: number;
};

export type MenuVariationAttributeModel = {
  options: MenuVariationOption[];
  attributeCount: number;
  attributeLabels: string[];
  flatKeys: boolean;
};

// Menu selection/display behavior comes from archived client commit 1ce9efb.
export function humanizeVariationSegment(segment: string): string {
  const value = String(segment || '').trim();
  if (!value) return '';
  const normalized = value.includes('=') ? value.split('=')[1] : value;
  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function humanizeVariationKey(key: string): string {
  const normalized = String(key || '').trim();
  if (!normalized) return '';
  return normalized.split('|').map(humanizeVariationSegment).filter(Boolean).join(' · ');
}

export function splitVariationKey(key: string, flatKeys: boolean): string[] {
  const raw = String(key ?? '').trim();
  if (!raw) return [];
  if (flatKeys) return [raw];
  return raw.split('|').map((segment) => {
    const cleaned = segment.includes('=') ? segment.split('=')[1] : segment;
    return cleaned.trim();
  });
}

function entries<T>(values: ProductValues<T>): [string, T][] {
  return values instanceof Map ? Array.from(values.entries()) : Object.entries(values);
}

export function extractMenuVariationOptions(product: ProductRow): MenuVariationOption[] {
  if (product.ptype !== 'Variation' || !product.warehouse) return [];
  const options: MenuVariationOption[] = [];
  const collect = (variationValues: ProductValues<ProductVariation | null> | undefined) => {
    if (!variationValues) return;
    entries(variationValues).forEach(([key, value]) => {
      const price = Number(value?.productPrice ?? product.price ?? 0) || 0;
      options.push({ key, label: humanizeVariationKey(key), price });
    });
  };
  entries(product.warehouse).forEach(([, warehouse]) => {
    if (!warehouse) return;
    collect(warehouse.variationValues);
    warehouse.batches?.forEach((batch) => collect(batch?.variationValues));
  });
  // Preserve the archived menu's last-entry-wins policy for duplicate keys.
  return Array.from(new Map(options.map((option) => [option.key, option])).values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  );
}

export function getMenuVariationAttributeModel(product: ProductRow): MenuVariationAttributeModel | null {
  const options = extractMenuVariationOptions(product);
  if (options.length === 0) return null;
  const flatKeys = options.every((option) => !option.key.includes('|'));
  const attributeCount = Math.max(1, splitVariationKey(options[0].key, flatKeys).length);
  const attributeLabels = product.variation
    ? product.variation.split('|').map((label) => label.trim()).filter(Boolean)
    : Array.from({ length: attributeCount }, (_, index) => `Option ${index + 1}`);
  while (attributeLabels.length < attributeCount) {
    attributeLabels.push(`Option ${attributeLabels.length + 1}`);
  }
  return { attributeCount, flatKeys, options, attributeLabels };
}

export function findMenuVariationOptionBySelection(
  options: MenuVariationOption[],
  flatKeys: boolean,
  parts: string[]
): MenuVariationOption | undefined {
  if (flatKeys) return options.find((option) => option.key === parts[0]);
  const target = parts.map((part) => String(part ?? '').trim()).join('|');
  return options.find((option) => splitVariationKey(option.key, flatKeys).join('|') === target);
}

export function variationValuesForDimension(
  options: MenuVariationOption[],
  attributeCount: number,
  flatKeys: boolean,
  dim: number,
  parts: string[] = []
): string[] {
  const values = new Set<string>();
  options.forEach((option) => {
    const valuesForKey = splitVariationKey(option.key, flatKeys);
    if (valuesForKey.length < attributeCount) return;
    for (let index = 0; index < dim; index += 1) {
      if (parts[index] && valuesForKey[index] !== parts[index]) return;
    }
    const value = valuesForKey[dim] ?? '';
    if (value) values.add(value);
  });
  return Array.from(values).sort((a, b) =>
    humanizeVariationSegment(a).localeCompare(humanizeVariationSegment(b), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  );
}

export function cascadeVariationSelection(
  options: MenuVariationOption[],
  model: MenuVariationAttributeModel,
  parts: string[],
  dim: number,
  value: string
): string[] {
  const nextParts = [...parts];
  nextParts[dim] = value;
  for (let nextDim = dim + 1; nextDim < model.attributeCount; nextDim += 1) {
    const values = variationValuesForDimension(options, model.attributeCount, model.flatKeys, nextDim, nextParts);
    nextParts[nextDim] = values[0] ?? '';
  }
  return nextParts;
}

/** Match viewProducts: batches take precedence, prices use min, stock uses sum. */
export function mapApiProductToProductRow(product: ApiProduct): ProductRow {
  const prices: number[] = [];
  const quantities: number[] = [];
  const collect = (value: ProductVariation | null) => {
    if (!value) throw new Error('Missing product variation');
    if (value.productPrice !== undefined && value.productPrice !== null) {
      prices.push(Number(value.productPrice));
    }
    if (value.productQty !== undefined && value.productQty !== null) {
      quantities.push(Number(value.productQty));
    }
  };
  const collectNode = (node: ProductBatch | null) => {
    if (!node) throw new Error('Missing product warehouse or batch');
    if (node.variationValues) {
      entries(node.variationValues).forEach(([, value]) => collect(value));
    } else {
      collect(node);
    }
  };
  try {
    if (product.warehouse) {
      entries(product.warehouse).forEach(([, warehouse]) => {
        if (warehouse?.batches && warehouse.batches.length > 0) {
          warehouse.batches.forEach(collectNode);
        } else {
          collectNode(warehouse);
        }
      });
    }
  } catch {
    // Preserve the product list's whole-row fallback for malformed nested data.
    prices.length = 0;
    quantities.length = 0;
  }
  return {
    id: product._id,
    name: product.name,
    code: product.code,
    brand: product.brand,
    category: product.category,
    image: product.image,
    unit: product.unit,
    saleUnit: product.saleUnit,
    ptype: product.ptype,
    status: product.status,
    createdAt: product.createdAt,
    warehouse: product.warehouse,
    variation: product.variation,
    price: prices.length === 0 ? 0 : Math.min(...prices),
    inStock: quantities.reduce((sum, quantity) => sum + quantity, 0),
    isInventory: product.isInventory
  };
}
