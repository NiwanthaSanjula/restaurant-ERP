import './demoSeed/env';
import { execFileSync } from 'child_process';
import path from 'path';
import mongoose from 'mongoose';
import { APP_TIME_ZONE, formatDateOnlyParts, getZonedParts } from '../utils/timezone';
import { Anchor, buildPlan, NAMESPACE, Row } from './demoSeed/plan';
import { reconcile, validateSchemas } from './demoSeed/validate';
import { assertAttributionRecords, DEMO_ACTOR_ID, DEMO_ROLE_ID, withDemoIdentity } from './demoSeed/identity';
import { applyPlan, MANIFEST_COLLECTION, preflight, SeedManifest, verifyStored } from './demoSeed/storage';

export async function runDemoSeed(args=process.argv.slice(2)): Promise<void> {
  const allowed=new Set(['--apply','--verify','--as-of','--cutoff']);
  for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw new Error('Unknown seed argument. Supported: --apply, --verify, --as-of YYYY-MM-DD, --cutoff HH:MM.');if(['--as-of','--cutoff'].includes(args[i])){if(!args[i+1])throw new Error('Missing date/cutoff argument.');i++;}}
  if(args.includes('--apply')&&args.includes('--verify'))throw new Error('Choose apply or read-only verify, not both.');
  const branch=execFileSync('git',['branch','--show-current'],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'}).trim();
  if(branch!=='develop')throw new Error('Seed requires the existing develop branch.');
  if(APP_TIME_ZONE!=='Asia/Colombo')throw new Error('Configured business timezone is not Asia/Colombo; no writes allowed.');
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/dilshani_db',{autoCreate:false,autoIndex:false,serverSelectionTimeoutMS:10000});
  const db=mongoose.connection.db;
  const previous=await db.collection<SeedManifest>(MANIFEST_COLLECTION).findOne({_id:NAMESPACE});
  const setting=await db.collection('settings').findOne({},{projection:{'system.currency':1}});
  const saved=setting?.system?.currency;
  const currency=saved?await db.collection('currencies').findOne(mongoose.isValidObjectId(saved)?{_id:new mongoose.Types.ObjectId(saved)}:{code:saved},{projection:{code:1}}):await db.collection('currencies').findOne({},{projection:{code:1}});
  if(!currency?.code)throw new Error('Existing currency cannot be resolved; settings will not be created or changed.');
  if(previous&&previous.anchor.actorId!==DEMO_ACTOR_ID)throw new Error('Existing seed has different attribution; no account/register reassignment will be attempted.');
  const actor=await db.collection('users').findOne({_id:new mongoose.Types.ObjectId(DEMO_ACTOR_ID)},{projection:{passwordHash:1,password:1,isActive:1,role:1,roleId:1}});
  if(actor&&!previous?.records.some(record=>record.model==='User'&&record.id===DEMO_ACTOR_ID))throw new Error('Dedicated demo identity collides with a non-seed account; no accounts will be modified.');
  if(actor){
    const role=await db.collection('roles').findOne({_id:new mongoose.Types.ObjectId(DEMO_ROLE_ID)},{projection:{permissions:1,isActive:1}});
    assertAttributionRecords(actor,role);
  }
  const option=(name:string)=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
  const now=getZonedParts(new Date(),'Asia/Colombo'),today=formatDateOnlyParts(now);
  const cutoffMinutes=Math.min(20*60,now.hour*60+now.minute-2);
  const anchor:Anchor=previous?.anchor||{asOf:option('--as-of')||today,cutoff:option('--cutoff')||`${String(Math.floor(cutoffMinutes/60)).padStart(2,'0')}:${String(cutoffMinutes%60).padStart(2,'0')}`,actorId:DEMO_ACTOR_ID,currency:currency.code};
  if((option('--as-of')&&option('--as-of')!==anchor.asOf)||(option('--cutoff')&&option('--cutoff')!==anchor.cutoff))throw new Error('Existing manifest anchors are immutable.');
  if(anchor.currency!==currency.code)throw new Error('Currency changed since this demo was planned; no existing seed records will be rewritten.');
  const plan=await withDemoIdentity(buildPlan(anchor),actor?.passwordHash);await validateSchemas(plan);const validation=reconcile(plan);
  if(plan.entries.some(e=>e.doc.createdAt>new Date()||e.doc.updatedAt>new Date()))throw new Error('Future demo activity is not allowed. Choose a cutoff before now.');
  const checked=await preflight(db,plan,previous);
  const hello=await db.admin().command({hello:1});const transactions=!!hello.setName||hello.msg==='isdbgrid';
  const mode=args.includes('--apply')?'apply':args.includes('--verify')?'verify':'dry-run';
  if(mode==='verify'&&!previous)throw new Error('No seed manifest exists to verify.');
  let result:Row={wouldInsert:checked.pending.length,skipped:checked.existingCount,preservedEditedSeedRecords:checked.edited.length};
  if(mode==='apply')result=await applyPlan(db,plan,previous,transactions);
  let stored:Row|undefined;
  if((mode==='apply'||previous?.state==='complete')&&checked.edited.length===0)stored=await verifyStored(db,plan);
  console.log(JSON.stringify({mode,namespace:NAMESPACE,transactionsAvailable:transactions,currencyMode:saved?'existing-setting':'existing-frontend-first-currency-fallback',...validation,...result,...(stored?{storedVerification:stored}:{})},null,2));
}

if(require.main===module){runDemoSeed().catch(error=>{
  // Only controlled validation messages; driver errors can contain connection/record data.
  const safe=error instanceof Error&&error.constructor===Error?error.message:'Database/schema operation failed; no connection details or record values are printed.';
  console.error(JSON.stringify({status:'failed',message:safe,code:typeof error?.code==='number'?error.code:undefined}));process.exitCode=1;
}).finally(()=>mongoose.disconnect());}
