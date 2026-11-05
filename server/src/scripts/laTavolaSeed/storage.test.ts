import mongoose from 'mongoose';
import { buildLaTavolaPlan, canonical, fingerprint, NAMESPACE, oid, Row } from './plan';
import { apply, Manifest, preservationHashes, repeatability } from './storage';
import { models, validateSchemas } from './validate';

function memoryDb(documents: Record<string, any[]>) {
  const cloned = () => JSON.parse(JSON.stringify(canonical(documents)));
  const db = {
    listCollections: () => ({ toArray: async () => Object.keys(documents).map(name => ({ name })) }),
    collection: (name: string) => ({
      find: (query: any) => {
        const match = (doc: any) => !query._id || (query._id.$in ? query._id.$in.some((id: any) => String(id) === String(doc._id)) : !query._id.$nin?.some((id: any) => String(id) === String(doc._id)));
        const result = { sort: () => result, toArray: async () => (cloned()[name] || []).filter(match) }; return result;
      },
      findOne: async (query: any) => (cloned()[name] || []).find(doc => String(doc._id) === String(query._id)) || null,
    }),
  };
  return db as unknown as mongoose.mongo.Db;
}
describe('La Tavola seed preservation and repeatability, in-memory storage only', () => {
  it('never schedules inserts or stock effects after completion, including edited and deleted records', async () => {
    const plan = buildLaTavolaPlan({}, '2026-11-04', 1200, { _id: oid('cashier'), name: 'Kasun Jayawardena' }); await validateSchemas(plan);
    const documents: Record<string, Row[]> = Object.fromEntries([...new Set(plan.entries.map(e => models[e.model].collection.name))].map(name => [name, plan.entries.filter(e => models[e.model].collection.name === name).map(e => ({ ...e.doc, _id: String(e.doc._id) }))]));
    const manifest: Manifest = { _id: NAMESPACE, state: 'complete', planHash: fingerprint(plan), plan, completedAt: new Date(), verification: {} };
    expect(await repeatability(memoryDb(documents), manifest)).toMatchObject({ wouldInsert: 0, wouldApplyStockEffects: 0, ownedPresent: plan.entries.length, preservedEditedRecords: 0 });
    documents.products[0].name = 'Updated kitchen name'; documents.expenses.pop();
    const before = fingerprint(documents);
    expect(await repeatability(memoryDb(documents), manifest)).toMatchObject({ wouldInsert: 0, wouldApplyStockEffects: 0, preservedEditedRecords: 1, preservedDeletedRecords: 1 });
    expect(fingerprint(documents)).toBe(before);
  });
  it('refuses apply without the exact reviewed plan hash before any storage access', async () => {
    const plan = buildLaTavolaPlan({}, '2026-11-04', 1200, { _id: oid('cashier'), name: 'Kasun Jayawardena' });
    const collection = jest.fn(); await expect(apply({ collection } as unknown as mongoose.mongo.Db, plan, 'unreviewed')).rejects.toThrow(/reviewed dry-run hash/);
    expect(collection).not.toHaveBeenCalled();
  });
  it('fingerprints existing users, roles and all unrelated fields while allowing only reviewed water stock paths', async () => {
    const storageId = oid('storage'), product = { _id: oid('water'), name: 'Bottled Water 1L', code: 'LKY-BTLW-1L', unit: 'Piece', isInventory: true, isSellable: true, status: 'Active', ptype: 'Single', warehouse: { [String(storageId)]: { warehouseName: 'Storage', productPrice: 100, productCost: 75, productQty: 99, stockAlert: 50 } } };
    const plan = buildLaTavolaPlan({ Product: [product], Warehouse: [{ _id: storageId, name: 'Storage', isActive: true }] }, '2026-11-04', 1200, { _id: oid('cashier'), name: 'Kasun Jayawardena' });
    const documents = { products: [JSON.parse(JSON.stringify(canonical(product)))], users: [{ _id: 'existing-user', isActive: true, roleId: 'existing-role' }], roles: [{ _id: 'existing-role', permissions: [{ component: 'manageProducts', actions: { read: true } }] }] };
    const before = await preservationHashes(memoryDb(documents), plan);
    documents.products[0] = plan.patches[0].after as typeof product;
    expect(await preservationHashes(memoryDb(documents), plan)).toEqual(before);
    documents.products[0].warehouse[String(storageId)].productPrice = 125;
    expect(await preservationHashes(memoryDb(documents), plan)).not.toEqual(before);
    documents.products[0].warehouse[String(storageId)].productPrice = 100; documents.users[0].roleId = 'changed-role';
    expect(await preservationHashes(memoryDb(documents), plan)).not.toEqual(before);
  });
});
