import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { canonical, oid, Plan, Row } from './plan';

export const DEMO_ACTOR_ID = String(oid('user/attribution-cashier'));
export const DEMO_ROLE_ID = String(oid('role/attribution-cashier'));
// Role's schema requires at least one real grant. This is read-only; the user
// is deactivated, so both login and authenticated requests remain denied.
export const DEMO_PERMISSIONS = [{ component: 'managePOS', actions: { view_pos: true } }];

export async function withDemoIdentity(plan: Plan, existingPasswordHash?: string): Promise<Plan> {
  if (plan.anchor.actorId !== DEMO_ACTOR_ID) throw new Error('Demo attribution must use its dedicated deterministic cashier.');
  let passwordHash = existingPasswordHash;
  if (!passwordHash) {
    const secret = crypto.randomBytes(48);
    try { passwordHash = await bcrypt.hash(secret.toString('base64url'), 12); }
    finally { secret.fill(0); }
  }
  const stamp = plan.entries[0].doc.createdAt;
  const role: Row = { _id: oid('role/attribution-cashier'), name: 'Demo · Seed attribution cashier',
    description: 'REST-014 fictional attribution only. One read-only grant required by the Role schema; assigned user cannot log in.',
    permissions: DEMO_PERMISSIONS.map(p=>({component:p.component,actions:{...p.actions}})), isActive:true, createdAt:stamp, updatedAt:stamp, __v:0 };
  const user: Row = { _id: oid('user/attribution-cashier'), name:'Demo · Seed Cashier',
    email:'rest014.cashier@example.com', passwordHash, role:'staff', roleId:role._id,
    isActive:false, createdAt:stamp, updatedAt:stamp, __v:0 };
  const entries = [{model:'Role',key:'role/attribution-cashier',doc:role},{model:'User',key:'user/attribution-cashier',doc:user},...plan.entries];
  const result: Plan = {...plan,entries,summary:{...plan.summary,counts:{Role:1,User:1,...plan.summary.counts},demoCashierLoginDisabled:true,demoRoleGrantCount:1}};
  assertDemoIdentity(result);
  return result;
}

export function assertDemoIdentity(plan: Plan): void {
  const users=plan.entries.filter(e=>e.model==='User'),roles=plan.entries.filter(e=>e.model==='Role');
  if (users.length!==1||roles.length!==1) throw new Error('Exactly one demo attribution user and role are permitted.');
  assertAttributionRecords(users[0].doc,roles[0].doc,plan.anchor.actorId);
}

export function assertAttributionRecords(user: Row, role: Row, actorId=DEMO_ACTOR_ID): void {
  if(!user||!role||String(user._id)!==DEMO_ACTOR_ID||actorId!==DEMO_ACTOR_ID||String(role._id)!==DEMO_ROLE_ID||String(user.roleId)!==DEMO_ROLE_ID)throw new Error('Dedicated demo identity/role reference mismatch.');
  if(user.isActive!==false||user.role!=='staff'||user.password!==undefined)throw new Error('Demo cashier must remain deactivated, non-administrator, and hash-only.');
  if(role.isActive!==true||JSON.stringify(canonical(role.permissions))!==JSON.stringify(canonical(DEMO_PERMISSIONS)))throw new Error('Demo role may contain only the required read-only POS grant.');
  if(typeof user.passwordHash!=='string'||!/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(user.passwordHash)||bcrypt.getRounds(user.passwordHash)<12)throw new Error('Demo cashier requires a generated bcrypt hash with cost >= 12.');
}
