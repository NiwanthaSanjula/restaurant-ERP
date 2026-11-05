import mongoose from 'mongoose';
import User from '../models/User';
import Role from '../models/Role';
import { provisionPublicDemo } from './provisionPublicDemo';
import { PUBLIC_DEMO_USER_ID, PUBLIC_DEMO_ROLE_ID } from '../config/publicDemo';

let records: Record<string, any[]>;
const session = { withTransaction: jest.fn(async fn => fn()), startTransaction: jest.fn(), abortTransaction: jest.fn(), endSession: jest.fn() };
function equal(actual: unknown, expected: unknown): boolean {
  if (expected && typeof expected === 'object' && '$ne' in expected) return String(actual) !== String((expected as any).$ne);
  return String(actual) === String(expected);
}
beforeEach(() => {
  jest.restoreAllMocks(); jest.clearAllMocks();
  records = { users: [{ _id: 'existing', name: 'Existing account', passwordHash: 'untouched', roleId: 'owner' }], roles: [{ _id: 'owner', name: 'Existing role' }], products: [{ _id: 'item', warehouse: { storage: { productQty: 4 } } }] };
  const db = {
    listCollections: () => ({ toArray: async () => Object.keys(records).map(name => ({ name })) }),
    collection: (name: string) => ({
      findOne: async (filter: Record<string, unknown>) => records[name].find(doc => Object.entries(filter).every(([key, value]) => equal(doc[key], value))) || null,
      find: (filter: Record<string, unknown>) => ({ sort: () => records[name].filter(doc => Object.entries(filter).every(([key, value]) => equal(doc[key], value))) })
    })
  };
  Object.defineProperty(mongoose.connection, 'db', { value: db, configurable: true, writable: true });
  jest.spyOn(mongoose, 'startSession').mockResolvedValue(session as any);
  jest.spyOn(User.prototype, 'save').mockImplementation(async function () { records.users.push(this.toObject()); return this; });
  jest.spyOn(Role.prototype, 'save').mockImplementation(async function () { records.roles.push(this.toObject()); return this; });
});
it('dry-runs without inserts, then provisions only the explicit visitor and role idempotently', async () => {
  const before = JSON.stringify(records);
  expect((await provisionPublicDemo(false)).wouldAddUsers).toBe(1); expect(JSON.stringify(records)).toBe(before);
  const applied = await provisionPublicDemo(true); expect(applied.addedUsers).toBe(1); expect(applied.addedRoles).toBe(1);
  expect(records.users[0].passwordHash).toBe('untouched'); expect(records.products[0].warehouse.storage.productQty).toBe(4);
  const visitor = records.users.find(user => String(user._id) === PUBLIC_DEMO_USER_ID);
  expect(visitor.isPublicDemo).toBe(true); expect(visitor.role).toBe('staff'); expect(visitor.passwordHash.startsWith('$2')).toBe(true);
  const role = records.roles.find(role => String(role._id) === PUBLIC_DEMO_ROLE_ID);
  expect(role.permissions.flatMap(entry => Object.keys(entry.actions)).some(action => /create|edit|delete|payment|open_session/.test(action))).toBe(false);
  expect((await provisionPublicDemo(true)).addedUsers).toBe(0); expect((await provisionPublicDemo(false)).wouldAddRoles).toBe(0);
});
it('stops on collisions instead of modifying an existing account', async () => {
  records.users.push({ _id: 'other', email: 'public.visitor@example.com' });
  const before = JSON.stringify(records);
  await expect(provisionPublicDemo(true)).rejects.toThrow('collision'); expect(JSON.stringify(records)).toBe(before);
});
it('does not repair edited visitor grants or add missing privileges', async () => {
  await provisionPublicDemo(true);
  records.roles.find(role => String(role._id) === PUBLIC_DEMO_ROLE_ID).permissions.push({ component: 'managePOS', actions: { create_sale: true } });
  const before = JSON.stringify(records);
  await expect(provisionPublicDemo(true)).rejects.toThrow('differs'); expect(JSON.stringify(records)).toBe(before);
});
