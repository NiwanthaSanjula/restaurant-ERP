import { mongoDemoSessionStore, demoSessionStore, resetDemoStoresForTests, DEMO_LOGIN_WINDOW_MS, DEMO_SESSION_COLLECTION } from './demoSessionStore';
import mongoose from 'mongoose';
function fixture() {
  const documents: Record<string, Map<string, any>> = {};
  const database = { collection: (name: string) => {
    documents[name] ||= new Map(); const rows = documents[name];
    return {
      listIndexes: () => ({ toArray: async () => [{ key: { expiresAt: 1 }, expireAfterSeconds: 0 }] }),
      insertOne: async (doc: any) => { if (rows.has(doc._id)) throw Object.assign(Error('Duplicate'), { code: 11000 }); rows.set(doc._id, doc); },
      findOne: async (filter: any) => { const row = rows.get(filter._id); return row && row.expiresAt > filter.expiresAt.$gt ? row : null; },
      deleteOne: async (filter: any) => { rows.delete(filter._id); },
      updateOne: async (filter: any, update: any, options?: any) => {
        const row = rows.get(filter._id);
        if (row && row.count < filter.count.$lt) { row.count += update.$inc.count; return { matchedCount: 1, upsertedCount: 0 }; }
        if (options?.upsert) { if (row) throw Object.assign(Error('Duplicate'), { code: 11000 }); rows.set(filter._id, { _id: filter._id, count: 1, ...update.$setOnInsert }); return { matchedCount: 0, upsertedCount: 1 }; }
        return { matchedCount: 0, upsertedCount: 0 };
      }
    };
  } };
  return { database: database as unknown as mongoose.mongo.Db, documents };
}
it('shares sessions, expiry and revocation across independent workers, without relying on TTL cleanup timing', async () => {
  const { database, documents } = fixture(), a = mongoDemoSessionStore(database), b = mongoDemoSessionStore(database);
  await a.create('opaque-session', 10000); expect(await b.active('opaque-session', 5000)).toBe(true);
  expect(await b.active('opaque-session', 10000)).toBe(false); expect(documents[DEMO_SESSION_COLLECTION].size).toBe(1);
  await b.revoke('opaque-session'); expect(await a.active('opaque-session', 5000)).toBe(false);
});
it('atomically allows only 10 concurrent logins across workers, with independent IPs and expiring windows', async () => {
  const { database } = fixture(), a = mongoDemoSessionStore(database), b = mongoDemoSessionStore(database);
  const now = DEMO_LOGIN_WINDOW_MS * 100 + 1;
  const granted = await Promise.all(Array.from({ length: 30 }, (_, n) => (n % 2 ? a : b).allowLogin('127.0.0.1', now)));
  expect(granted.filter(Boolean)).toHaveLength(10);
  expect(await b.allowLogin('127.0.0.2', now)).toBe(true);
  expect(await b.allowLogin('127.0.0.1', now + DEMO_LOGIN_WINDOW_MS)).toBe(true);
});
it('fails closed when shared indexes are absent', async () => {
  const database = { collection: () => ({ listIndexes: () => ({ toArray: async () => [] }) }) };
  await expect(mongoDemoSessionStore(database as any).allowLogin('127.0.0.1', 0)).rejects.toThrow('TTL indexes');
});
it('never permits an in-memory production store or falls back when shared storage is unavailable', () => {
  const original = { node: process.env.NODE_ENV, mode: process.env.DEMO_SESSION_STORE, vercel: process.env.VERCEL };
  try {
    process.env.NODE_ENV = 'production'; process.env.DEMO_SESSION_STORE = 'memory'; expect(() => demoSessionStore()).toThrow('shared MongoDB');
    process.env.DEMO_SESSION_STORE = 'mongodb'; expect(() => demoSessionStore()).toThrow('unavailable');
  } finally {
    for (const [key, value] of Object.entries({ NODE_ENV: original.node, DEMO_SESSION_STORE: original.mode, VERCEL: original.vercel })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    resetDemoStoresForTests();
  }
});
