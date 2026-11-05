import './demoSeed/env';
import mongoose from 'mongoose';
import { createHash } from 'crypto';
import { DEMO_SESSION_COLLECTION, DEMO_THROTTLE_COLLECTION } from '../services/demoSessionStore';
import { isDemoExpiryIndex } from '../services/demoStoragePolicy';

const targets = [DEMO_SESSION_COLLECTION, DEMO_THROTTLE_COLLECTION];

/** Hash in memory only: never write a database dump or expose record values. */
async function businessFingerprint(database: mongoose.mongo.Db) {
  const hash = createHash('sha256');
  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    if (targets.includes(name) || name.startsWith('system.')) continue;
    hash.update(name);
    hash.update(JSON.stringify(await database.collection(name).listIndexes().toArray()));
    for await (const row of database.collection(name).find({}).sort({ _id: 1 })) hash.update(JSON.stringify(row));
  }
  return hash.digest('hex');
}

export async function prepareDemoStorage(database: mongoose.mongo.Db, apply = false) {
  const results: Array<{ collection: string; records: number; expiryField: string; ttlReady: boolean; createdIndex: boolean }> = [];
  // Inspect BOTH namespaces and every existing expiry before making any change.
  for (const name of targets) {
    const collection = database.collection(name);
    const exists = await database.listCollections({ name }, { nameOnly: true }).hasNext();
    const indexes = exists ? await collection.listIndexes().toArray() : [];
    const ttlReady = indexes.some(isDemoExpiryIndex);
    if (indexes.some(index => ('expiresAt' in index.key && !isDemoExpiryIndex(index)) || ('expireAfterSeconds' in index && !isDemoExpiryIndex(index)) || (index.name === 'demo_expiry' && !isDemoExpiryIndex(index)))) throw new Error(`Unsafe existing index in ${name}; no indexes changed.`);
    let records = 0;
    if (exists) for await (const row of collection.find({})) {
      const session = name === DEMO_SESSION_COLLECTION;
      const allowed = session ? ['_id', 'expiresAt'] : ['_id', 'expiresAt', 'count'];
      const idValid = typeof row._id === 'string' && (session
        ? /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row._id)
        : /^[0-9a-f]{64}$/.test(row._id));
      if (!idValid || Object.keys(row).some(key => !allowed.includes(key)) ||
          !(row.expiresAt instanceof Date) || !Number.isFinite(row.expiresAt.getTime()) ||
          (!session && (!Number.isInteger(row.count) || row.count < 1 || row.count > 10))) {
        throw new Error(`Unexpected record or expiry field in ${name}; no indexes changed. Values withheld.`);
      }
      records++;
    }
    results.push({ collection: name, records, expiryField: 'expiresAt (BSON Date)', ttlReady, createdIndex: false });
  }
  const before = apply ? await businessFingerprint(database) : undefined;
  if (apply) for (const result of results) {
    const collection = database.collection(result.collection);
    if (!result.ttlReady) {
      await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'demo_expiry' });
      result.createdIndex = true;
    }
    result.ttlReady = (await collection.listIndexes().toArray()).some(isDemoExpiryIndex);
    if (!result.ttlReady) throw new Error(`TTL verification failed for ${result.collection}. No business writes were issued.`);
  }
  const businessRecordsUnchanged = apply ? before === await businessFingerprint(database) : true;
  if (!businessRecordsUnchanged) throw new Error('Business fingerprint changed concurrently; investigate. This utility only issued auth-index DDL.');
  return { mode: apply ? 'apply' : 'dry-run', results, businessRecordsUnchanged };
}
if (require.main === module) (async () => {
  if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Use no arguments for dry-run, or --apply for auth-storage indexes only.');
  if (!process.env.MONGODB_URI) throw new Error('Set the intended target MONGODB_URI before checking session storage.');
  await mongoose.connect(process.env.MONGODB_URI, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000 });
  console.log(JSON.stringify(await prepareDemoStorage(mongoose.connection.db, process.argv.includes('--apply'))));
})().catch(error => { console.error(error.constructor === Error ? error.message : 'Demo storage setup failed; connection details withheld.'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
