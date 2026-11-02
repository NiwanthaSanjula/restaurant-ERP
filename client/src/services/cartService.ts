const api = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;

export type CartDiscountType = "fixed" | "percentage";

export type CartVariation = {
  id: string;
  name: string;
  price: number;
};

export type CartLine = {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  image?: string;
  variation?: CartVariation;
  cartKey: string;
};

export type CartData = {
  items: CartLine[];
  discountType: CartDiscountType;
  discount: number;
  shipping: number;
};

type ApiEnvelope<T> = {
  status: "success" | "error";
  message?: string;
  data?: T;
};

type AddToCartPayload = {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  image?: string;
  variation?: CartVariation;
  cartKey: string;
  warehouseId: string;
  sessionId?: string;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseResponse<T>(res: Response, fallbackError: string): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!res.ok || data.status === "error" || data.data == null) {
    throw new Error(data.message || fallbackError);
  }
  return data.data;
}

export async function getCart(sessionId?: string): Promise<CartData> {
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  const res = await fetch(`${api}/cart${qs}`, { headers: authHeaders() });
  return parseResponse<CartData>(res, "Failed to fetch cart");
}

export async function addToCart(payload: AddToCartPayload): Promise<CartData> {
  const res = await fetch(`${api}/cart`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return parseResponse<CartData>(res, "Failed to add item to cart");
}

export async function updateCartItem(
  cartKey: string,
  quantity: number,
  warehouseId: string,
  sessionId?: string
): Promise<CartData> {
  const res = await fetch(`${api}/cart/item`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ cartKey, quantity, warehouseId, sessionId }),
  });
  return parseResponse<CartData>(res, "Failed to update cart item");
}

export async function removeCartItem(cartKey: string, sessionId?: string): Promise<CartData> {
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  const res = await fetch(`${api}/cart/item/${encodeURIComponent(cartKey)}${qs}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return parseResponse<CartData>(res, "Failed to remove cart item");
}

export async function updateCartSettings(
  discountType: CartDiscountType,
  discount: number,
  shipping: number,
  sessionId?: string
): Promise<CartData> {
  const res = await fetch(`${api}/cart/settings`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ discountType, discount, shipping, sessionId }),
  });
  return parseResponse<CartData>(res, "Failed to update cart settings");
}

/** Clears server cart for current user; optional POS sessionId scopes cart row. */
export async function clearCart(sessionId?: string): Promise<void> {
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  const res = await fetch(`${api}/cart${qs}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (res.status === 404) return;
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || "Failed to clear cart");
  }
}
