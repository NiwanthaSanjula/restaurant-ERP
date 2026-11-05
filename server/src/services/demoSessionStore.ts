import { createHmac } from 'crypto';
import mongoose from 'mongoose';
import { isDemoExpiryIndex } from './demoStoragePolicy';

export const DEMO_SESSION_COLLECTION = 'public_demo_sessions';
export const DEMO_THROTTLE_COLLECTION = 'public_demo_login_limits';
export const DEMO_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export interface DemoSessionStore {
  allowLogin(ip: string, now: number): Promise<boolean>;
  create(id: string, expiresAt: number): Promise<void>;
  active(id: string, now: number): Promise<boolean>;
  revoke(id: string): Promise<void>;
}
type Database = Pick<mongoose.mongo.Db, 'collection'>;

/** No runtime DDL: deployment setup creates TTL indexes explicitly. Expiry is
 * also checked in every read, because MongoDB's TTL cleanup is asynchronous. */
export function mongoDemoSessionStore(database: Database): DemoSessionStore {
  const sessions = database.collection<any>(DEMO_SESSION_COLLECTION);
  const attempts = database.collection<any>(DEMO_THROTTLE_COLLECTION);
  let ready: Promise<void> | undefined;
  const check = () => ready ||= (async () => {
    for (const collection of [sessions, attempts]) {
      const indexes = await collection.listIndexes().toArray();
      if (!indexes.some(isDemoExpiryIndex)) throw new Error('Demo storage TTL indexes are not prepared.');
    }
  })().catch(error => { ready = undefined; throw error; });
  return {
    async allowLogin(ip, now) {
      await check();
      const window = Math.floor(now / DEMO_LOGIN_WINDOW_MS);
      const id = createHmac('sha256', process.env.JWT_SECRET || '').update(`demo-login:${window}:${ip}`).digest('hex');
      const filter = { _id: id, count: { $lt: 10 } }, increment = { $inc: { count: 1 } };
      try {
        const result = await attempts.updateOne(filter, { ...increment, $setOnInsert: { expiresAt: new Date((window + 1) * DEMO_LOGIN_WINDOW_MS) } }, { upsert: true });
        return result.matchedCount === 1 || result.upsertedCount === 1;
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        // A concurrent first insert or an exhausted bucket: retry an atomic,
        // bounded increment without upsert. No worker can grant an 11th login.
        return (await attempts.updateOne(filter, increment)).matchedCount === 1;
      }
    },
    async create(id, expiresAt) { await check(); await sessions.insertOne({ _id: id, expiresAt: new Date(expiresAt) }); },
    async active(id, now) { await check(); return !!await sessions.findOne({ _id: id, expiresAt: { $gt: new Date(now) } }, { projection: { _id: 1 } }); },
    async revoke(id) { await check(); await sessions.deleteOne({ _id: id }); }
  };
}

export function memoryDemoSessionStore() {
  const sessions = new Map<string, number>(), attempts = new Map<string, { count: number; until: number }>();
  const prune = (now: number) => { for (const [key, expires] of sessions) if (expires <= now) sessions.delete(key); for (const [key, bucket] of attempts) if (bucket.until <= now) attempts.delete(key); };
  return {
    async allowLogin(ip: string, now: number) {
      prune(now); const bucket = attempts.get(ip);
      if (bucket && bucket.count >= 10) return false;
      if (bucket) bucket.count++; else { if (attempts.size >= 2000) return false; attempts.set(ip, { count: 1, until: now + DEMO_LOGIN_WINDOW_MS }); }
      return true;
    },
    async create(id: string, expiresAt: number) { prune(Date.now()); if (sessions.size >= 1000) throw new Error('Demo capacity reached'); sessions.set(id, expiresAt); },
    async active(id: string, now: number) { prune(now); return (sessions.get(id) || 0) > now; },
    async revoke(id: string) { sessions.delete(id); },
    clear() { sessions.clear(); attempts.clear(); }
  };
}

const memory = memoryDemoSessionStore();
let shared: DemoSessionStore | undefined, sharedDatabase: mongoose.mongo.Db | undefined;
export function demoSessionStore(): DemoSessionStore {
  const deployed = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const mode = process.env.DEMO_SESSION_STORE || (deployed ? 'mongodb' : 'memory');
  if (mode === 'memory' && !deployed) return memory;
  if (mode !== 'mongodb') throw new Error('Deployed demo sessions require shared MongoDB storage.');
  const database = mongoose.connection.db;
  if (!database || mongoose.connection.readyState !== 1) throw new Error('Shared demo storage is unavailable.');
  if (!shared || sharedDatabase !== database) { sharedDatabase = database; shared = mongoDemoSessionStore(database); }
  return shared;
}
export function resetDemoStoresForTests() { memory.clear(); shared = undefined; sharedDatabase = undefined; }
