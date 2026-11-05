import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { PUBLIC_DEMO_USER_ID } from '../config/publicDemo';
import { demoSessionStore, resetDemoStoresForTests } from './demoSessionStore';

export const DEMO_SESSION_SECONDS = 60 * 60;
export async function allowDemoLogin(ip: string) { return demoSessionStore().allowLogin(ip, Date.now()); }
export async function createDemoSession() {
  const jti = randomUUID(), until = Date.now() + DEMO_SESSION_SECONDS * 1000;
  const token = jwt.sign({ id: PUBLIC_DEMO_USER_ID, demo: true }, process.env.JWT_SECRET as string, { jwtid: jti, expiresIn: DEMO_SESSION_SECONDS });
  await demoSessionStore().create(jti, until); return token;
}
export async function demoSessionActive(jti: unknown) { return typeof jti === 'string' && await demoSessionStore().active(jti, Date.now()); }
export async function revokeDemoSession(jti: string) { await demoSessionStore().revoke(jti); }
export function resetDemoSessionsForTests() { resetDemoStoresForTests(); }
