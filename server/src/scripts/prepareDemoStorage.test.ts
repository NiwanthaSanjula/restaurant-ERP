import mongoose from 'mongoose';
import { prepareDemoStorage } from './prepareDemoStorage';
import { DEMO_SESSION_COLLECTION as sessions, DEMO_THROTTLE_COLLECTION as limits } from '../services/demoSessionStore';
import { isDemoExpiryIndex } from '../services/demoStoragePolicy';

function fixture() {
  const documents: Record<string, any[]> = { settings: [{ _id: 'preserved', system: { companyName: 'La Tavola' } }] };
  const indexes: Record<string, any[]> = { settings: [{ key: { _id: 1 }, name: '_id_' }] };
  const created: string[] = [];
  const cursor = (rows: any[]) => ({ toArray: async () => rows, hasNext: async () => !!rows.length,
    sort() { return this; }, async *[Symbol.asyncIterator]() { yield* rows; } });
  const database = {
    listCollections: (filter: any) => cursor(Object.keys(indexes).filter(name => !filter.name || filter.name === name).map(name => ({ name }))),
    collection: (name: string) => ({
      listIndexes: () => cursor(indexes[name] || []), find: () => cursor(documents[name] || []),
      createIndex: async (key: any, options: any) => { created.push(name); indexes[name] ||= [{ key: { _id: 1 }, name: '_id_' }]; indexes[name].push({ key, ...options }); return options.name; }
    })
  };
  return { database: database as unknown as mongoose.mongo.Db, documents, indexes, created };
}
it('defaults to dry-run without creating collections or touching business records', async () => {
  const f = fixture(), before = JSON.stringify(f.documents);
  const result = await prepareDemoStorage(f.database);
  expect(result.mode).toBe('dry-run'); expect(result.results.every(row => row.records === 0 && !row.ttlReady)).toBe(true);
  expect(f.created).toEqual([]); expect(JSON.stringify(f.documents)).toBe(before);
});
it('creates and verifies exactly two auth TTL indexes, preserves business content/indexes and is repeatable', async () => {
  const f = fixture(), original = JSON.stringify(f.documents.settings);
  expect((await prepareDemoStorage(f.database, true)).businessRecordsUnchanged).toBe(true);
  expect(f.created).toEqual([sessions, limits]);
  expect((await prepareDemoStorage(f.database, true)).results.every(row => row.ttlReady && !row.createdIndex)).toBe(true);
  expect(f.created).toHaveLength(2); expect(JSON.stringify(f.documents.settings)).toBe(original);
  expect(f.indexes.settings).toEqual([{ key: { _id: 1 }, name: '_id_' }]);
});
it.each([
  { _id: 'business-record', expiresAt: new Date() },
  { _id: 'a'.repeat(64), expiresAt: '2026-11-05', count: 1 },
  { _id: 'a'.repeat(64), expiresAt: new Date(), count: 11 },
  { _id: 'a'.repeat(64), expiresAt: new Date(), count: 1, credentials: 'not-auth-storage' },
])('refuses unexpected records in the second collection before ANY index is created', async row => {
  const f = fixture(); f.indexes[limits] = []; f.documents[limits] = [row];
  await expect(prepareDemoStorage(f.database, true)).rejects.toThrow('Unexpected record'); expect(f.created).toEqual([]);
});
it('recognizes only the exact non-unique full-field TTL definition', () => {
  const safe = { key: { expiresAt: 1 }, expireAfterSeconds: 0 };
  expect(isDemoExpiryIndex(safe)).toBe(true);
  for (const bad of [{ ...safe, unique: true }, { ...safe, sparse: true }, { ...safe, partialFilterExpression: { active: true } }, { ...safe, expireAfterSeconds: 60 }, { ...safe, key: { expiresAt: 1, count: 1 } }]) expect(isDemoExpiryIndex(bad)).toBe(false);
});
it('refuses an incompatible existing expiry index without replacing it', async () => {
  const f = fixture(); f.indexes[limits] = [{ name: 'legacy', key: { expiresAt: 1 }, expireAfterSeconds: 3600 }];
  await expect(prepareDemoStorage(f.database, true)).rejects.toThrow('Unsafe existing index'); expect(f.created).toEqual([]);
});
it('accepts only the actual temporary session and throttle record shapes', async () => {
  const f = fixture(); f.indexes[sessions] = []; f.indexes[limits] = [];
  f.documents[sessions] = [{ _id: '12345678-1234-4234-8234-123456789abc', expiresAt: new Date() }];
  f.documents[limits] = [{ _id: 'a'.repeat(64), expiresAt: new Date(), count: 10 }];
  const result = await prepareDemoStorage(f.database); expect(result.results.map(row => row.records)).toEqual([1, 1]);
});
