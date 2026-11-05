import './demoSeed/env';
import { execFileSync } from 'child_process';
import path from 'path';
import mongoose from 'mongoose';
import { APP_TIME_ZONE, formatDateOnlyParts, getZonedParts } from '../utils/timezone';
import { NAMESPACE } from './laTavolaSeed/plan';
import { planHash } from './laTavolaSeed/validate';
import { apply, loadPlanningData, MANIFEST_COLLECTION, Manifest, preflight, repeatability, verifyStored } from './laTavolaSeed/storage';

export async function runLaTavolaSeed(args = process.argv.slice(2)) {
  const allowed = new Set(['--apply', '--verify', '--as-of', '--cutoff', '--expect-plan']);
  for (let index = 0; index < args.length; index++) {
    if (!allowed.has(args[index])) throw new Error('Unknown option. Use --apply, --verify, --as-of YYYY-MM-DD, --cutoff HH:MM, --expect-plan HASH.');
    if (['--as-of', '--cutoff', '--expect-plan'].includes(args[index])) { if (!args[index + 1]) throw new Error('Missing option value.'); index++; }
  }
  if (args.includes('--apply') && args.includes('--verify')) throw new Error('Choose apply or read-only verify.');
  const option = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }).trim();
  if (branch !== 'develop') throw new Error('This seed may run only on the current develop branch.');
  if (APP_TIME_ZONE !== 'Asia/Colombo') throw new Error('Configured business timezone must remain Asia/Colombo.');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dilshani_db', { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db, mode = args.includes('--apply') ? 'apply' : args.includes('--verify') ? 'verify' : 'dry-run';
  const manifest = await db.collection<Manifest>(MANIFEST_COLLECTION).findOne({ _id: NAMESPACE });
  if (manifest) {
    const repeated = await repeatability(db, manifest);
    if (mode === 'verify' && (repeated.preservedEditedRecords || repeated.preservedDeletedRecords)) throw new Error('Saved dataset has changed since insertion. Edits/deletions are preserved; original-fixture verification is unavailable.');
    const verified = mode === 'verify' ? await verifyStored(db, manifest.plan) : undefined;
    console.log(JSON.stringify({ mode, alreadyApplied: true, ...repeated, ...(verified ? { verification: verified } : {}), summary: manifest.plan.summary }, null, 2)); return;
  }
  if (mode === 'verify') throw new Error('No La Tavola dataset manifest exists yet.');
  const hello = await db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('This dataset requires transactions to preserve the reused water balance and exactly-once stock effects.');
  const probe = await mongoose.startSession();
  try { probe.startTransaction({ readConcern: { level: 'snapshot' } }); await db.collection('warehouses').findOne({}, { session: probe, projection: { _id: 1 } }); await probe.abortTransaction(); } finally { await probe.endSession(); }
  const asOf = option('--as-of') || formatDateOnlyParts(getZonedParts(new Date(), 'Asia/Colombo'));
  const cutoffText = option('--cutoff') || '20:00';
  if (!/^\d\d:\d\d$/.test(cutoffText) || Number(cutoffText.slice(3)) > 59) throw new Error('Invalid cutoff time.');
  const cutoff = Number(cutoffText.slice(0, 2)) * 60 + Number(cutoffText.slice(3));
  const plan = await loadPlanningData(db, asOf, cutoff), verification = await preflight(db, plan), hash = planHash(plan);
  if (mode === 'apply') {
    const expected = option('--expect-plan'); if (!expected) throw new Error('--apply requires --expect-plan from the successful reviewed dry run.');
    const result = await apply(db, plan, expected);
    console.log(JSON.stringify({ mode, namespace: NAMESPACE, planHash: hash, ...result, summary: plan.summary }, null, 2));
  } else console.log(JSON.stringify({ mode, namespace: NAMESPACE, planHash: hash, wouldInsert: plan.entries.length, wouldPatchExistingProducts: plan.patches.length, transactionsCheckedReadOnly: true, verification, summary: plan.summary }, null, 2));
}
if (require.main === module) runLaTavolaSeed().catch(error => {
  console.error(JSON.stringify({ status: 'failed', message: error instanceof Error && error.constructor === Error ? error.message : 'Database/schema operation failed. Connection details and record values are withheld.', code: typeof error?.code === 'number' ? error.code : undefined })); process.exitCode = 1;
}).finally(() => mongoose.disconnect());
