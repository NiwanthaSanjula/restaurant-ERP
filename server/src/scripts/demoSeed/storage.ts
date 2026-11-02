import mongoose from 'mongoose';
import { canonical, Entry, fingerprint, fixtureDoc, fixtureFingerprint, NAMESPACE, Plan, Row } from './plan';
import { models, reconcile } from './validate';

export const MANIFEST_COLLECTION = 'demo_seed_manifests';
export interface SeedManifest extends Row {
  _id: string;
  state: 'pending' | 'complete';
  anchor: Plan['anchor'];
  planHash: string;
  records: Array<{ model: string; key: string; id: string; hash: string }>;
}
const coll = (db: mongoose.mongo.Db, model: string) => db.collection(models[model].collection.name);
const groups = (plan: Plan) => Object.keys(models).map(model=>({model,entries:plan.entries.filter(e=>e.model===model)})).filter(g=>g.entries.length);
export const planHash = (plan: Plan) => fingerprint({namespace:plan.namespace,version:plan.version,anchor:plan.anchor,entries:plan.entries.map(e=>({...e,doc:fixtureDoc(e.model,e.doc)}))});
export function makeManifest(plan: Plan): SeedManifest {
  return {_id:NAMESPACE,state:'pending',anchor:plan.anchor,planHash:planHash(plan),version:plan.version,randomSeed:140026,openingStock:0,summary:plan.summary,records:plan.entries.map(e=>({model:e.model,key:e.key,id:String(e.doc._id),hash:fixtureFingerprint(e.model,e.doc)}))};
}
const oid = (id: string) => new mongoose.Types.ObjectId(id);
const equal = (a: unknown,b:unknown) => JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

/** A user cannot have closed demo shifts inside an already-open real shift. */
export function assertNoRegisterOverlap(planned: Row[], existing: Row[]): void {
  const overlapping=planned.filter(seed=>existing.some(real=>{
    const from=new Date(real.openTime).getTime();
    const until=real.closeTime?new Date(real.closeTime).getTime():Infinity;
    if(!Number.isFinite(from)||Number.isNaN(until))throw new Error('Existing register dates are invalid; manual review required.');
    return from<new Date(seed.closeTime).getTime()&&until>new Date(seed.openTime).getTime();
  }));
  if(overlapping.length)throw new Error(`Register timeline collision: ${overlapping.length} planned closed sessions overlap existing register history for the required actor. Existing accounts/registers will not be changed.`);
}

function matchesPartial(doc: Row, filter?: Row): boolean {
  if(!filter)return true;
  for(const [key,value]of Object.entries(filter)){
    if(value && typeof value==='object')throw new Error('Unsupported partial unique index; explicit seed review required.');
    if(!equal(doc[key],value))return false;
  }
  return true;
}

/** Examines both declared and actual database unique indexes; no index/DDL writes. */
export async function preflight(db: mongoose.mongo.Db, plan: Plan, manifest: SeedManifest | null) {
  if(manifest && manifest.planHash!==planHash(plan))throw new Error('Stored seed plan differs from this version. Refusing to replace existing seed data.');
  const sessions=plan.entries.filter(e=>e.model==='PosSession').map(e=>e.doc);
  if(sessions.length&&manifest?.state!=='complete'){
    const existing=await coll(db,'PosSession').find({userId:new mongoose.Types.ObjectId(plan.anchor.actorId),_id:{$nin:sessions.map(s=>s._id)}},{projection:{openTime:1,closeTime:1,status:1}}).toArray();
    assertNoRegisterOverlap(sessions,existing);
  }
  const pending: Entry[]=[], edited: string[]=[];
  let existingCount=0;
  for(const {model,entries}of groups(plan)){
    const collection=coll(db,model);
    const existing=await collection.find({_id:{$in:entries.map(e=>e.doc._id)}}).toArray();
    const byId=new Map(existing.map(doc=>[String(doc._id),doc]));
    for(const entry of entries){const found=byId.get(String(entry.doc._id));
      if(!found){pending.push(entry);continue;}
      if(!manifest?.records.some(r=>r.model===model&&r.id===String(found._id)))throw new Error(`Identifier collision: ${model}, seed key ${entry.key}`);
      existingCount++;
      if(fixtureFingerprint(model,found)!==fixtureFingerprint(model,entry.doc))edited.push(`${model}/${entry.key}`);
    }
    let actual: Row[]=[];
    try {actual=await collection.listIndexes().toArray();}catch(e){if((e as Row).code!==26)throw e;}
    const declared=models[model].schema.indexes().filter(([,options])=>options.unique).map(([key,options])=>({key,...options}));
    const indexes: Row[]=[{key:{_id:1},unique:true},...declared,...actual.filter(index=>index.unique)];
    const seenIndexes=new Set<string>();
    for(const index of indexes){
      const signature=fingerprint({key:index.key,partial:index.partialFilterExpression,collation:index.collation});if(seenIndexes.has(signature))continue;seenIndexes.add(signature);
      const fields=Object.keys(index.key),values=new Set<string>();
      const indexed=entries.filter(e=>matchesPartial(e.doc,index.partialFilterExpression)&&(!index.sparse||fields.some(f=>e.doc[f]!=null)));
      const normalize=(v: unknown)=>typeof v==='string'&&index.collation?.strength<=2?v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase():v;
      for(const e of indexed){const signature=fingerprint(fields.map(f=>normalize(e.doc[f]??null)));if(values.has(signature))throw new Error(`Duplicate planned ${model} unique index (${fields.join(',')})`);values.add(signature);}
      // Only records to be inserted can collide. Completed, edited records stay skipped.
      const incoming=indexed.filter(e=>!byId.has(String(e.doc._id)));
      for(let start=0;start<incoming.length;start+=200){
        const batch=incoming.slice(start,start+200), queries=batch.map(e=>Object.fromEntries(fields.map(f=>[f,e.doc[f]??null])));
        const options: Row={projection:Object.fromEntries(['_id',...fields].map(f=>[f,1]))};if(index.collation)options.collation=index.collation;
        if(!queries.length)continue;
        const conflicts=await collection.find({$or:queries},options).toArray();
        if(conflicts.length)throw new Error(`Existing-record collision: ${model} unique index (${fields.join(',')}); no records changed.`);
      }
    }
    // Controller-level case-insensitive ingredient-name uniqueness is stricter than its DB index.
    if(model==='KitchenInventoryProduct'){
      for(const entry of entries.filter(e=>!byId.has(String(e.doc._id)))){
        const escaped=String(entry.doc.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        if(await collection.findOne({name:new RegExp(`^${escaped}$`,'i')},{projection:{_id:1}}))throw new Error('Existing kitchen ingredient name collision.');
      }
    }
  }
  if(manifest?.state==='complete'&&pending.length)throw new Error('A completed seed record was deleted; refusing to recreate user deletions.');
  if(manifest?.state==='pending'&&edited.length)throw new Error('Incomplete seed has edited records. Stop for manual reconciliation; nothing will be overwritten.');
  return {pending,existingCount,edited};
}

/** Hashes only; never exports records or credentials or creates a DB backup. */
export async function nonSeedFingerprints(db: mongoose.mongo.Db,plan: Plan,session?:mongoose.ClientSession): Promise<Row> {
  const collections=await db.listCollections({}, {nameOnly:true}).toArray(),result:Row={};
  const owned=new Map(groups(plan).map(g=>[models[g.model].collection.name,g.entries.map(e=>e.doc._id)]));
  for(const {name}of collections){
    if(name===MANIFEST_COLLECTION||name.startsWith('system.'))continue;
    const query=owned.has(name)?{_id:{$nin:owned.get(name)}}:{};
    const documents=await db.collection(name).find(query,{session}).sort({_id:1}).toArray();
    result[name]={count:documents.length,hash:fingerprint(documents)};
  }
  return result;
}

const writeOrder=['Role','User','BaseUnit','Unit','Warehouse','Category','Brand','Supplier','Customer','Variation','ExpenseCategory','Product','KitchenInventoryProduct','KitchenRecipe','PosSession','Purchase','InventoryAdjustment','Sale','KitchenStockMovement','Expense'];
/** Insert only. Never update stock or an application record, even when resuming. */
export async function insertPending(db: mongoose.mongo.Db, pending: Entry[],session?:mongoose.ClientSession): Promise<void> {
  for(const model of writeOrder){
    const entries=pending.filter(e=>e.model===model);
    for(let start=0;start<entries.length;start+=300)await coll(db,model).insertMany(entries.slice(start,start+300).map(e=>e.doc),{ordered:true,session});
  }
}

export async function verifyStored(db:mongoose.mongo.Db,plan:Plan,session?:mongoose.ClientSession):Promise<Row>{
  const actual:Entry[]=[];
  for(const {model,entries}of groups(plan)){
    const docs=await coll(db,model).find({_id:{$in:entries.map(e=>e.doc._id)}},{session}).toArray();
    const byId=new Map(docs.map(d=>[String(d._id),d]));
    for(const entry of entries){const doc=byId.get(String(entry.doc._id));if(!doc)throw new Error(`Missing stored seed record: ${model}`);if(fixtureFingerprint(model,doc)!==fixtureFingerprint(model,entry.doc))throw new Error(`Stored seed data differs: ${model}, key ${entry.key}`);actual.push({...entry,doc});}
  }
  const checked=reconcile({...plan,entries:actual});
  // Real read-only aggregations on the fields used by dashboard and reports.
  const businessDates=await coll(db,'Sale').aggregate([
    {$match:{_id:{$in:plan.entries.filter(e=>e.model==='Sale').map(e=>e.doc._id)}}},
    {$group:{_id:{$dateToString:{format:'%Y-%m-%d',date:'$date',timezone:'Asia/Colombo'}},count:{$sum:1},total:{$sum:'$total'}}},{$sort:{_id:1}}
  ],{session}).toArray();
  const dashboardDates=await coll(db,'Sale').aggregate([
    {$match:{_id:{$in:plan.entries.filter(e=>e.model==='Sale').map(e=>e.doc._id)}}},
    {$group:{_id:{$dateToString:{format:'%Y-%m-%d',date:'$createdAt',timezone:'Asia/Colombo'}},count:{$sum:1},total:{$sum:'$total'}}},{$sort:{_id:1}}
  ],{session}).toArray();
  if(!equal(businessDates,dashboardDates)||businessDates.length!==plan.dates.length)throw new Error('Report/dashboard date reconciliation failed.');
  const today=businessDates.find(d=>d._id===plan.anchor.asOf);
  if(!today?.count)throw new Error('Today has no stored demo activity.');
  return {...checked,todaySales:today.count,todaySalesTotal:today.total,reportAndDashboardDatesAgree:true,firstDate:businessDates[0]._id,lastDate:businessDates[businessDates.length-1]._id};
}

export async function applyPlan(db:mongoose.mongo.Db,plan:Plan,previous:SeedManifest|null,transactions:boolean){
  const pre=await preflight(db,plan,previous);
  if(previous?.state==='complete')return {inserted:0,skipped:pre.existingCount,preservedEditedSeedRecords:pre.edited.length};
  const baseline=await nonSeedFingerprints(db,plan);
  const manifests=db.collection<SeedManifest>(MANIFEST_COLLECTION);
  if(!previous)await manifests.insertOne(makeManifest(plan));
  const insertAndVerify=async(session?:mongoose.ClientSession)=>{
    if(!equal(await nonSeedFingerprints(db,plan,session),baseline))throw new Error('Existing records changed during preflight; seed stopped.');
    await insertPending(db,pre.pending,session);
    const verified=await verifyStored(db,plan,session);
    if(!equal(await nonSeedFingerprints(db,plan,session),baseline))throw new Error('Non-seed record preservation check failed.');
    const update=await manifests.updateOne({_id:NAMESPACE,planHash:planHash(plan),state:'pending'},{$set:{state:'complete',completedAt:new Date(),verification:verified}},{session});
    if(update.matchedCount!==1)throw new Error('Seed manifest state changed; refusing concurrent overwrite.');
  };
  if(transactions){const session=await mongoose.startSession();try{await session.withTransaction(()=>insertAndVerify(session),{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});}finally{await session.endSession();}}
  else await insertAndVerify(); // Manifest+IDs make insert-only standalone recovery resumable.
  const preserved=equal(await nonSeedFingerprints(db,plan),baseline);
  if(!preserved)throw new Error('Seed applied, but concurrent non-seed changes were observed; no existing records were written by the seed.');
  return {inserted:pre.pending.length,skipped:pre.existingCount,preservedEditedSeedRecords:0,existingRecordsUnchanged:true};
}
