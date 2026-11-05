type ExpiryIndex = { key?: Record<string, unknown>; expireAfterSeconds?: unknown; unique?: unknown; sparse?: unknown; partialFilterExpression?: unknown };

/** Only a complete, non-unique TTL index on the temporary expiry field is safe. */
export function isDemoExpiryIndex(index: ExpiryIndex): boolean {
  return index.key?.expiresAt === 1 && Object.keys(index.key).length === 1 &&
    index.expireAfterSeconds === 0 && !index.unique && !index.sparse && !index.partialFilterExpression;
}
