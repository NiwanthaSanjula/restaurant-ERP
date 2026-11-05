import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { webcrypto } from 'crypto';
const source = fs.readFileSync(path.resolve(__dirname, '../../../client/src/services/dishDraft.ts'), 'utf8');
const helper = new Function('exports', 'crypto', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText + ';return exports;')({}, webcrypto);
const actor = 'fixture-author', product = 'a'.repeat(24);
function storage() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } }; }
const draft = () => ({ ...helper.newDishDraft(), fields: { name: 'Fried Rice', code: 'FRIED-RICE', category: 'Hot Meals', unit: 'Portion', locationId: 'b'.repeat(24), price: '500', cost: '60' }, rows: [{ id: 'c'.repeat(24), quantity: '150' }] });
describe('actual New Dish durable draft helper', () => {
  it('keeps the creation key/payload across an uncertain response and reload, then uses the same product ID', async () => {
    const local = storage(), original = draft(); let existing: any = null, creates = 0, failed = false;
    const post = jest.fn(async body => {
      if (!existing) { existing = structuredClone(body); creates++; } else expect(body).toEqual(existing);
      if (!failed) { failed = true; throw new Error('Response lost after product creation'); }
      return { id: product };
    });
    await expect(helper.createDishDraft(local, actor, original, 'Counter', post)).rejects.toThrow(/Response lost/);
    const reloaded = helper.loadDishDraft(local, actor); expect(reloaded.creationPayload.status).toBe('Pending'); expect(reloaded.rows[0].quantity).toBe('150');
    const saved = await helper.createDishDraft(local, actor, reloaded, 'Counter', post);
    expect(saved.productId).toBe(product); expect(creates).toBe(1);
    await helper.createDishDraft(local, actor, saved, 'Counter', post); expect(post).toHaveBeenCalledTimes(2);
  });
  it('allows correction of a definite validation/SKU conflict while retaining the draft and ingredients', async () => {
    const local = storage(), original = draft();
    await expect(helper.createDishDraft(local, actor, original, 'Counter', async () => { throw Object.assign(new Error('Duplicate SKU'), { status: 409, code: 'dish_details_conflict' }); })).rejects.toThrow(/Duplicate SKU/);
    expect(helper.loadDishDraft(local, actor)).toEqual(original);
  });
  it('does not send without durable storage, and does not discard another account or dish draft', async () => {
    const local = storage(), post = jest.fn();
    await expect(helper.createDishDraft({ ...local, setItem: () => { throw new Error('storage unavailable'); } }, actor, draft(), 'Counter', post)).rejects.toThrow(/storage unavailable/); expect(post).not.toHaveBeenCalled();
    helper.storeDishDraft(local, actor, { ...draft(), productId: product }); helper.clearDishDraft(local, 'another-author', product); helper.clearDishDraft(local, actor, 'd'.repeat(24));
    expect(helper.loadDishDraft(local, actor).productId).toBe(product); helper.clearDishDraft(local, actor, product); expect(helper.loadDishDraft(local, actor)).toBeNull();
  });
});
