import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import fs from 'fs';
import path from 'path';
import { createHttpApp } from './httpApp';

function request(app: ReturnType<typeof createHttpApp>, url: string, origin = 'http://localhost:5173') {
  return new Promise<{ status: number; body: any; origin?: string }>((resolve, reject) => {
    const socket = new Socket();
    const req = Object.assign(new IncomingMessage(socket), { method: 'GET', url, headers: { host: 'fixture.invalid', origin } });
    const res = new ServerResponse(req);
    jest.spyOn(res, 'end').mockImplementation(chunk => {
      try { resolve({ status: res.statusCode, body: JSON.parse(String(chunk)), origin: res.getHeader('Access-Control-Allow-Origin') as string }); } catch (error) { reject(error); }
      socket.destroy(); return res;
    });
    app(req, res);
  });
}
it('awaits request-time connection readiness in the exported API application', async () => {
  let release: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  const connect = jest.fn(() => ready), app = createHttpApp(connect);
  const response = request(app, '/api/health');
  expect(connect).toHaveBeenCalledTimes(1); release!(); expect((await response).status).toBe(200);
});
it('fails safely when database readiness fails, without entering the API router', async () => {
  const app = createHttpApp(async () => { throw Error('private connection detail'); });
  const response = await request(app, '/api/health'); expect(response.status).toBe(503); expect(JSON.stringify(response.body)).not.toContain('private connection detail');
});
it('keeps normal anonymous business API requests protected', async () => {
  expect((await request(createHttpApp(), '/api/purchases')).status).toBe(401);
});
it('has explicit client/server Vercel roots, a real TypeScript build and SPA routing', () => {
  const server = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8'));
  const client = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../client/vercel.json'), 'utf8'));
  expect(server.framework).toBe('express'); expect(server.buildCommand).toBe('npm run build');
  expect(client.outputDirectory).toBe('dist');
  const spa = new RegExp('^' + client.rewrites.find(rule => rule.destination === '/index.html').source + '$');
  expect(spa.test('/pos')).toBe(true); expect(spa.test('/reports/purchase')).toBe(true);
  expect(spa.test('/portfolio-assets/la-tavola-logo.jpg')).toBe(false); expect(spa.test('/fonts/Montserrat-Variable.ttf')).toBe(false);
});
