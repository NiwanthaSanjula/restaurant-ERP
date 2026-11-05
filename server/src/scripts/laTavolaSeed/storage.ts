import mongoose from 'mongoose';
import { models, planHash, reconcile, registerOverlap, validateSchemas } from './validate';
import { buildLaTavolaPlan, Entry, fingerprint, NAMESPACE, Plan, Row } from './plan';
import { getRolePermissions, checkPermissionInMap } from '../../config/rbac';

export const MANIFEST_COLLECTION = 'demo_seed_manifests';
export type Manifest = { _id: string; state: 'complete'; planHash: string; plan: Plan; completedAt: Date; verification: Row };
const coll = (db: mongoose.mongo.Db, model: string) => db.collection(models[model].collection.name);
const groups = (entries: Entry[]) => [...new Set(entries.map(e => e.model))].map(model => ({ model, entries: entries.filter(e => e.model === model) }));
const getPath = (doc: Row, path: string) => path.split('.').reduce((value, key) => value?.[key], doc);
const same = (a: unknown, b: unknown) => fingerprint(a) === fingerprint(b);
function partialMatches(doc: Row, filter?: Row): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([key, wanted]) => {
    const value = getPath(doc, key);
    if (wanted && typeof wanted === 'object') {
      if ('$exists' in wanted) return (value !== undefined) === wanted.$exists;
      if ('$type' in wanted) return wanted.$type === 'string' ? typeof value === 'string' : value != null;
      if ('$eq' in wanted) return same(value, wanted.$eq);
      throw new Error('An unsupported unique-index partial filter needs review.');
    }
    return same(value, wanted);
  });
}
export async function loadPlanningData(db: mongoose.mongo.Db, asOf: string, cutoff: number) {
  const existing: Record<string, Row[]> = {};
  for (const model of ['Unit', 'Warehouse', 'Category', 'Brand', 'Supplier', 'Product', 'ExpenseCategory']) existing[model] = await coll(db, model).find({}).toArray();
  const users = await coll(db, 'User').find({ isActive: true }, { projection: { _id: 1, name: 1, isActive: 1, roleId: 1, createdAt: 1 } }).sort({ _id: 1 }).toArray();
  for (const user of users) {
    const permissions = await getRolePermissions({ roleId: user.roleId });
    if (!checkPermissionInMap(permissions, 'managePOS', 'view_pos') || !checkPermissionInMap(permissions, 'managePOS', 'create_sale')) continue;
    return buildLaTavolaPlan(existing, asOf, cutoff, user);
  }
  throw new Error('No active existing account has explicit POS view/create grants for attribution. No user or role will be changed.');
}
export async function preflight(db: mongoose.mongo.Db, plan: Plan, session?: mongoose.ClientSession) {
  if (plan.namespace !== NAMESPACE) throw new Error('Seed namespace mismatch.');
  await validateSchemas(plan); const verified = reconcile(plan);
  if (plan.entries.some(e => e.doc.createdAt > new Date() || e.doc.updatedAt > new Date())) throw new Error('The reviewed history includes future activity.');
  const settings = await db.collection('settings').findOne({}, { session, projection: { 'system.currency': 1 } });
  const currencyId = settings?.system?.currency;
  const currency = currencyId ? await db.collection('currencies').findOne(mongoose.isValidObjectId(currencyId) ? { _id: new mongoose.Types.ObjectId(currencyId) } : { code: currencyId }, { session, projection: { code: 1 } }) : null;
  if (currency?.code !== 'LKR') throw new Error('The configured currency must be LKR. Settings will not be changed.');
  for (const reference of plan.references) {
    const stored = await coll(db, reference.model).findOne({ _id: reference.doc._id }, { session });
    if (!stored || (reference.model === 'User' ? stored.name !== reference.doc.name || stored.isActive !== true || String(stored.roleId) !== String(reference.doc.roleId) : !same(stored, reference.doc))) throw new Error(`A reused ${reference.model} changed during planning. Review a fresh dry run.`);
  }
  const currentActor = await coll(db, 'User').findOne({ _id: new mongoose.Types.ObjectId(plan.anchor.actorId) }, { session, projection: { roleId: 1, isActive: 1 } });
  const actorPermissions = currentActor?.isActive ? await getRolePermissions({ roleId: currentActor.roleId }) : null;
  if (!checkPermissionInMap(actorPermissions, 'managePOS', 'view_pos') || !checkPermissionInMap(actorPermissions, 'managePOS', 'create_sale')) throw new Error('Attribution permissions changed; no grants will be added.');
  const oldSessions = await coll(db, 'PosSession').find({ userId: new mongoose.Types.ObjectId(plan.anchor.actorId) }, { session, projection: { openTime: 1, closeTime: 1, status: 1 } }).toArray();
  registerOverlap(plan.entries.filter(e => e.model === 'PosSession').map(e => e.doc), oldSessions);
  for (const { model, entries } of groups(plan.entries)) {
    const collection = coll(db, model);
    if (await collection.findOne({ _id: { $in: entries.map(e => e.doc._id) } }, { session, projection: { _id: 1 } })) throw new Error(`Unowned deterministic ${model} ID collision. No records will be overwritten.`);
    if (model === 'Sale' && await collection.findOne({ invoiceId: { $in: entries.map(e => e.doc.invoiceId) } }, { session, projection: { _id: 1 } })) throw new Error('An existing sale invoice reference collides with the planned history.');
    let actual: Row[] = [];
    // MongoDB metadata commands cannot participate in a data transaction.
    // Inspect indexes read-only outside it; every collision query still uses its snapshot.
    try { actual = await collection.listIndexes().toArray(); } catch (error: any) { if (error.code !== 26) throw error; }
    const indexes = [...actual.filter(index => index.unique).map(index => ({ keys: index.key, options: index })), ...models[model].schema.indexes().filter(([, options]) => options.unique).map(([keys, options]) => ({ keys, options }))];
    const checkedIndexes = new Set<string>();
    for (const index of indexes) {
      const hash = fingerprint(index); if (checkedIndexes.has(hash)) continue; checkedIndexes.add(hash);
      const fields = Object.keys(index.keys), options = index.options as Row;
      const indexed = entries.filter(entry => partialMatches(entry.doc, options.partialFilterExpression) && (!options.sparse || fields.some(field => getPath(entry.doc, field) !== undefined)));
      const values = new Set<string>();
      for (const entry of indexed) {
        const signature = fingerprint(fields.map(field => { const value = getPath(entry.doc, field) ?? null; return options.collation?.strength <= 2 && typeof value === 'string' ? value.toLowerCase() : value; }));
        if (values.has(signature)) throw new Error(`Planned ${model} unique-index collision (${fields.join(',')}).`); values.add(signature);
      }
      for (let start = 0; start < indexed.length; start += 150) {
        const queries = indexed.slice(start, start + 150).map(entry => Object.fromEntries(fields.map(field => [field, getPath(entry.doc, field) ?? null])));
        if (queries.length && await collection.findOne({ $or: queries }, { session, projection: { _id: 1 }, ...(options.collation ? { collation: options.collation } : {}) })) throw new Error(`Existing ${model} unique-index collision (${fields.join(',')}).`);
      }
    }
    // Preserve the active UI's exact-name identities, including stricter controller checks.
    const nameField = ({ Product: 'name', KitchenInventoryProduct: 'name', Warehouse: 'name', Supplier: 'name', Category: 'category', Brand: 'brandName', Unit: 'unitName' } as Row)[model];
    if (nameField) for (const entry of entries) {
      const escaped = String(entry.doc[nameField]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (await collection.findOne({ [nameField]: new RegExp(`^${escaped}$`, 'i') }, { session, projection: { _id: 1 } })) throw new Error(`An existing ${model} name requires explicit matching, not a duplicate.`);
    }
  }
  for (const patch of plan.patches) {
    const before = await coll(db, patch.model).findOne({ _id: patch.before._id }, { session });
    if (!same(before, patch.before)) throw new Error('The reused bottled-water record changed. Review the updated baseline before applying.');
    if (Object.keys(patch.sets).some(path => !/^warehouse\.[a-f\d]{24}$/.test(path)) || Object.keys(patch.increments).some(path => !/^warehouse\.[a-f\d]{24}\.productQty$/.test(path))) throw new Error('A reused-item patch contains unsupported fields.');
  }
  const manifestBytes = mongoose.mongo.BSON.calculateObjectSize({ plan });
  if (manifestBytes > 8 * 1024 * 1024) throw new Error('The deterministic seed manifest is unexpectedly large.');
  return verified;
}

/** Hashes only; no existing user/role/settings or credential values are exported. */
export async function preservationHashes(db: mongoose.mongo.Db, plan: Plan, session?: mongoose.ClientSession) {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray(), result: Row = {};
  for (const { name } of collections) {
    if (name.startsWith('system.') || name === MANIFEST_COLLECTION) continue;
    const ownedIds = plan.entries.filter(entry => models[entry.model].collection.name === name).map(entry => entry.doc._id);
    const docs = await db.collection(name).find(ownedIds.length ? { _id: { $nin: ownedIds } } : {}, { session }).sort({ _id: 1 }).toArray();
    for (const patch of plan.patches.filter(p => models[p.model].collection.name === name)) {
      const found = docs.find(doc => String(doc._id) === String(patch.before._id));
      if (found) for (const path of [...Object.keys(patch.increments), ...Object.keys(patch.sets)]) {
        const parts = path.split('.'), field = parts.pop()!, parent = parts.reduce((obj, part) => obj?.[part], found);
        if (parent) delete parent[field];
      }
    }
    result[name] = { count: docs.length, hash: fingerprint(docs) };
  }
  return result;
}
export async function verifyStored(db: mongoose.mongo.Db, plan: Plan, session?: mongoose.ClientSession) {
  for (const { model, entries } of groups(plan.entries)) {
    const stored = await coll(db, model).find({ _id: { $in: entries.map(entry => entry.doc._id) } }, { session }).toArray();
    const byId = new Map(stored.map(doc => [String(doc._id), doc]));
    for (const entry of entries) if (!same(byId.get(String(entry.doc._id)), entry.doc)) throw new Error(`Stored ${model} fixture differs or is missing.`);
  }
  for (const patch of plan.patches) if (!same(await coll(db, patch.model).findOne({ _id: patch.before._id }, { session }), patch.after)) throw new Error('Reused water balance/location does not match the reviewed result.');
  const sales = await coll(db, 'Sale').aggregate([{ $match: { _id: { $in: plan.entries.filter(e => e.model === 'Sale').map(e => e.doc._id) } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'Asia/Colombo' } }, count: { $sum: 1 }, total: { $sum: '$total' } } }, { $sort: { _id: 1 } }], { session }).toArray();
  const dashboard = await coll(db, 'Sale').aggregate([{ $match: { _id: { $in: plan.entries.filter(e => e.model === 'Sale').map(e => e.doc._id) } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Colombo' } }, count: { $sum: 1 }, total: { $sum: '$total' } } }, { $sort: { _id: 1 } }], { session }).toArray();
  if (!same(sales, dashboard) || sales.length !== 30) throw new Error('Stored dashboard/report business-date aggregates differ.');
  return { ...reconcile(plan), anchorDateActivity: sales.find(day => day._id === plan.anchor.asOf), firstDate: sales[0]._id, lastDate: sales[sales.length - 1]._id, reportDatesMatch: true };
}
export async function repeatability(db: mongoose.mongo.Db, manifest: Manifest) {
  let present = 0, edited = 0, missing = 0;
  for (const { model, entries } of groups(manifest.plan.entries)) {
    const stored = await coll(db, model).find({ _id: { $in: entries.map(e => e.doc._id) } }).toArray(), byId = new Map(stored.map(doc => [String(doc._id), doc]));
    for (const entry of entries) { const doc = byId.get(String(entry.doc._id)); if (!doc) missing++; else { present++; if (!same(doc, entry.doc)) edited++; } }
  }
  for (const patch of manifest.plan.patches) if (!same(await coll(db, patch.model).findOne({ _id: patch.before._id }), patch.after)) edited++;
  return { wouldInsert: 0, wouldApplyStockEffects: 0, ownedPresent: present, preservedEditedRecords: edited, preservedDeletedRecords: missing };
}
export async function apply(db: mongoose.mongo.Db, plan: Plan, expectedPlanHash: string) {
  if (planHash(plan) !== expectedPlanHash) throw new Error('The reviewed dry-run hash does not match this plan. No writes allowed.');
  const baseline = await preservationHashes(db, plan), session = await mongoose.startSession();
  let result: Row | undefined;
  try {
    await session.withTransaction(async () => {
      const existing = await db.collection<Manifest>(MANIFEST_COLLECTION).findOne({ _id: NAMESPACE }, { session });
      if (existing) throw new Error('This dataset has already been applied. Run dry-run or verify; no stock will be posted again.');
      await preflight(db, plan, session);
      if (!same(baseline, await preservationHashes(db, plan, session))) throw new Error('Existing records changed after dry-run planning. No seed data was written.');
      for (const { model, entries } of groups(plan.entries)) for (let offset = 0; offset < entries.length; offset += 150) await coll(db, model).insertMany(entries.slice(offset, offset + 150).map(e => e.doc), { session, ordered: true });
      for (const patch of plan.patches) {
        const filter: Row = { _id: patch.before._id };
        for (const path of Object.keys(patch.increments)) filter[path] = getPath(patch.before, path);
        for (const path of Object.keys(patch.sets)) filter[path] = { $exists: false };
        const updated = await coll(db, patch.model).updateOne(filter, { $inc: patch.increments, $set: patch.sets }, { session });
        if (updated.matchedCount !== 1) throw new Error('Water baseline changed during apply. The transaction will roll back.');
      }
      result = await verifyStored(db, plan, session);
      if (!same(baseline, await preservationHashes(db, plan, session))) throw new Error('Existing-record preservation failed. The transaction will roll back.');
      await db.collection<Manifest>(MANIFEST_COLLECTION).insertOne({ _id: NAMESPACE, state: 'complete', planHash: expectedPlanHash, plan, completedAt: new Date(), verification: result }, { session });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
  } finally { await session.endSession(); }
  if (!result) throw new Error('Seed transaction was not confirmed; run read-only verification before retrying.');
  return { inserted: plan.entries.length, counts: plan.summary.counts, reusedProductStockPatches: plan.patches.length, existingRecordsPreserved: same(baseline, await preservationHashes(db, plan)), verification: result };
}
