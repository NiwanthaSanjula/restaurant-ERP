import { buildPlan, fingerprint, Plan } from './plan';
import { reconcile, validateSchemas } from './validate';
import { applyPlan, assertNoRegisterOverlap, insertPending, makeManifest, planHash, preflight } from './storage';
import { assertDemoIdentity, DEMO_ACTOR_ID, DEMO_PERMISSIONS, DEMO_ROLE_ID, withDemoIdentity } from './identity';

const anchor={asOf:'2026-11-02',cutoff:'20:00',actorId:'111111111111111111111111',currency:'EUR'};
let plan:Plan;
beforeAll(async()=>{plan=buildPlan(anchor);await validateSchemas(plan);},30000);

test('real schemas accept the complete fixture and every ledger reconciles',()=>{
  const result=reconcile(plan);
  expect(result.sellableMenuItems).toBe(30);expect(result.ingredientSKUs).toBe(14);
  expect(result.firstDate).toBe('2026-08-10');expect(result.lastDate).toBe('2026-11-02');
  expect(plan.weekdayDates).toBe(61);expect(plan.dates).toHaveLength(85);
  expect(result.todaySales).toBeGreaterThan(0);expect(result.chronologicalStock).toBe(true);
  expect(result.lowStockProducts).toBeGreaterThanOrEqual(2);expect(result.lowKitchenIngredients).toBeGreaterThanOrEqual(2);
});

test('fixed random seed, identifiers, timestamps and subdocuments are deterministic',async()=>{
  const again=buildPlan(anchor);await validateSchemas(again);
  expect(fingerprint(again)).toBe(fingerprint(plan));
},30000);

test('an explicit native LKR price list also reconciles without FX or settings writes',()=>{
  const lkr=buildPlan({...anchor,currency:'LKR'});expect(reconcile(lkr).currency).toBe('LKR');
  expect(lkr.entries.some(e=>['User','Role','Setting','Currency','MailSetting','ReceiptSetting'].includes(e.model))).toBe(false);
  expect(()=>buildPlan({...anchor,currency:'UNSUPPORTED'})).toThrow('native demo price lists');
});

test.each(['totals','payments','recipe','stock','variation','references'] as const)('rejects invalid %s fixtures before any storage',kind=>{
  const invalid=buildPlan(anchor),sale=invalid.entries.find(e=>e.model==='Sale')!.doc;
  if(kind==='totals')sale.total+=1;
  if(kind==='payments')sale.cashAmount+=1;
  if(kind==='recipe')invalid.entries.find(e=>e.model==='KitchenStockMovement'&&e.doc.source==='sale')!.doc.quantity+=1;
  if(kind==='stock')invalid.entries.find(e=>e.model==='InventoryAdjustment')!.doc.items[0].newStock+=1;
  if(kind==='variation')sale.products[0].variation='unsupported-portion';
  if(kind==='references')sale.customerId='000000000000000000000000';
  expect(()=>reconcile(invalid)).toThrow();
});

test('unknown persisted fields are rejected rather than silently discarded',async()=>{
  const invalid=buildPlan(anchor);invalid.entries[0].doc.unsupportedSeedField=true;
  await expect(validateSchemas(invalid)).rejects.toThrow('Schema validation failed');
});

function fakeStorage(initial:any[]=[]){
  const documents=[...initial];let inserts=0;
  const same=(a:unknown,b:unknown)=>String(a)===String(b);
  const collection={
    find:(query:any)=>({toArray:async()=>documents.filter(doc=>query._id?.$in?query._id.$in.some((id:any)=>same(id,doc._id)):query.$or?.some((filter:any)=>Object.entries(filter).every(([key,value])=>same(doc[key],value))))}),
    listIndexes:()=>({toArray:async()=>[{key:{_id:1},unique:true},{key:{code:1},unique:true}]}),
    insertMany:async(rows:any[])=>{for(const row of rows){if(documents.some(d=>same(d._id,row._id)))throw new Error('duplicate');documents.push(row);inserts++;}}
  };
  return {db:{collection:()=>collection} as any,documents,get inserts(){return inserts;}};
}
const productSubset=()=>({...plan,entries:plan.entries.filter(e=>e.model==='Product').slice(0,2)});

test('preflight refuses non-seed identifiers and unique-index collisions',async()=>{
  const small=productSubset(),first=small.entries[0].doc;
  await expect(preflight(fakeStorage([first]).db,small,null)).rejects.toThrow('Identifier collision');
  await expect(preflight(fakeStorage([{...first,_id:'222222222222222222222222'}]).db,small,null)).rejects.toThrow('Existing-record collision');
});

test('completed rerun skips edited records without overwriting or incrementing stock',async()=>{
  const small=productSubset(),manifest={...makeManifest(small),state:'complete' as const};
  const storage=fakeStorage(small.entries.map(e=>({...e.doc,note:'Edited after seed'})));
  const result=await applyPlan(storage.db,small,manifest,false);
  expect(result.inserted).toBe(0);expect(result.preservedEditedSeedRecords).toBe(2);expect(storage.inserts).toBe(0);
  expect(storage.documents[0].note).toBe('Edited after seed');
});

test('standalone interrupted runs insert only missing IDs and never repeat effects',async()=>{
  const small=productSubset(),manifest=makeManifest(small),storage=fakeStorage([small.entries[0].doc]);
  const first=await preflight(storage.db,small,manifest);expect(first.pending).toHaveLength(1);
  await insertPending(storage.db,first.pending);
  const second=await preflight(storage.db,small,manifest);expect(second.pending).toHaveLength(0);expect(storage.inserts).toBe(1);
  storage.documents[0]={...storage.documents[0],note:'User edited incomplete seed'};
  await expect(preflight(storage.db,small,manifest)).rejects.toThrow('manual reconciliation');
});

test('completed seed deletions are not silently resurrected',async()=>{
  const small=productSubset(),manifest={...makeManifest(small),state:'complete' as const};
  await expect(preflight(fakeStorage([small.entries[0].doc]).db,small,manifest)).rejects.toThrow('refusing to recreate');
});

test('existing long-running open registers block fabricated closed-register history',()=>{
  const sessions=plan.entries.filter(e=>e.model==='PosSession').map(e=>e.doc);
  expect(()=>assertNoRegisterOverlap(sessions,[{openTime:new Date('2026-07-01T06:39:11Z'),status:'OPEN'}])).toThrow('Register timeline collision: 85');
  expect(()=>assertNoRegisterOverlap(sessions,[{openTime:new Date('2026-07-01'),closeTime:new Date('2026-08-01'),status:'CLOSED'}])).not.toThrow();
});

test('register intervals may meet at a boundary but may not overlap',()=>{
  const planned=[{openTime:new Date('2026-11-02T08:00Z'),closeTime:new Date('2026-11-02T20:00Z')}];
  expect(()=>assertNoRegisterOverlap(planned,[{openTime:new Date('2026-11-02T07:00Z'),closeTime:new Date('2026-11-02T08:00Z')}])).not.toThrow();
  expect(()=>assertNoRegisterOverlap(planned,[{openTime:new Date('2026-11-02T19:59Z'),status:'OPEN'}])).toThrow('timeline collision');
});

describe('authorized dedicated demo attribution',()=>{
  let demo:Plan;
  beforeAll(async()=>{demo=await withDemoIdentity(buildPlan({...anchor,actorId:DEMO_ACTOR_ID}));await validateSchemas(demo);},30000);

  test('one disabled staff account and one minimum read-only role pass real schemas and reconciliation',()=>{
    expect(()=>assertDemoIdentity(demo)).not.toThrow();
    const user=demo.entries.find(e=>e.model==='User')!.doc,role=demo.entries.find(e=>e.model==='Role')!.doc;
    expect(String(user._id)).toBe(DEMO_ACTOR_ID);expect(String(user.roleId)).toBe(DEMO_ROLE_ID);
    expect(user.isActive).toBe(false);expect(user.role).toBe('staff');expect(user.password).toBeUndefined();
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);expect(role.permissions).toEqual(DEMO_PERMISSIONS);
    expect(reconcile(demo).counts.User).toBe(1);expect(reconcile(demo).counts.Role).toBe(1);
  });

  test('all creator and register attribution belongs to the demo cashier, not an existing user',()=>{
    for(const entry of demo.entries){
      if(entry.doc.createdBy)expect(String(entry.doc.createdBy)).toBe(DEMO_ACTOR_ID);
      if(entry.model==='PosSession')expect(String(entry.doc.userId)).toBe(DEMO_ACTOR_ID);
    }
  });

  test('credential generation is independent of deterministic fixtures and never copied into metadata',async()=>{
    const fresh=await withDemoIdentity(buildPlan({...anchor,actorId:DEMO_ACTOR_ID}));await validateSchemas(fresh);
    const hash=demo.entries.find(e=>e.model==='User')!.doc.passwordHash;
    expect(fresh.entries.find(e=>e.model==='User')!.doc.passwordHash).not.toBe(hash);
    expect(planHash(fresh)).toBe(planHash(demo));
    const metadata=JSON.stringify(makeManifest(demo));expect(metadata).not.toContain(hash);expect(metadata).not.toContain('passwordHash');
  },30000);

  test('reruns reuse the stored credential and insert neither another account nor another role',async()=>{
    const userEntry=demo.entries.find(e=>e.model==='User')!,hash=userEntry.doc.passwordHash;
    const again=await withDemoIdentity(buildPlan({...anchor,actorId:DEMO_ACTOR_ID}),hash);await validateSchemas(again);
    expect(planHash(again)).toBe(planHash(demo));expect(again.entries.find(e=>e.model==='User')!.doc.passwordHash).toBe(hash);
    const small={...demo,entries:[userEntry]},manifest={...makeManifest(small),state:'complete' as const};
    const storage=fakeStorage([userEntry.doc]);expect((await applyPlan(storage.db,small,manifest,false)).inserted).toBe(0);expect(storage.inserts).toBe(0);
  },30000);

  test('interactive activation or administrator grants are rejected without repairing user edits',()=>{
    const user=demo.entries.find(e=>e.model==='User')!.doc,role=demo.entries.find(e=>e.model==='Role')!.doc;
    const activated={...demo,entries:demo.entries.map(e=>e.model==='User'?{...e,doc:{...user,isActive:true}}:e)};
    expect(()=>assertDemoIdentity(activated)).toThrow('deactivated');
    const escalated={...demo,entries:demo.entries.map(e=>e.model==='Role'?{...e,doc:{...role,permissions:[...DEMO_PERMISSIONS,{component:'manageSettings',actions:{edit_restaurant_settings:true}}]}}:e)};
    expect(()=>assertDemoIdentity(escalated)).toThrow('read-only');
  });
});
