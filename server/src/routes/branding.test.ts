import express from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import getRoutes from './getRoutes';
import settingRoutes from './settingRoutes';
import { brandEmailContent, readPublicBranding } from '../services/branding';

const mocks = { read: jest.fn(), select: jest.fn() };
jest.mock('../models/Setting', () => ({ __esModule: true, default: {
  findOne: () => ({ select: (fields: string) => { mocks.select(fields); return { lean: () => mocks.read() }; } })
} }));
const app = express(); app.use('/api', getRoutes); app.use('/api/settings', settingRoutes);
function request(path: string): Promise<{ status: number; body: any; cache: unknown }> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const req = Object.assign(new IncomingMessage(socket), { method: 'GET', url: path, headers: { host: 'branding.test' } });
    const res = new ServerResponse(req);
    jest.spyOn(res, 'end').mockImplementation((chunk: unknown) => {
      try { resolve({ status: res.statusCode, body: JSON.parse(String(chunk)), cache: res.getHeader('Cache-Control') }); } catch (error) { reject(error); }
      socket.destroy(); return res;
    }); app(req, res);
  });
}
beforeEach(() => { jest.clearAllMocks(); mocks.read.mockResolvedValue({ system: { companyName: '  Cinnamon & Curry  ', companyLogo: '/uploads/logo.png', password: 'fixture-only-secret', defaultEmail: 'fictional@example.invalid' }, mail: { password: 'fixture-only-secret' } }); });

describe('public display branding without opening protected settings', () => {
  it('serves only the configured name/logo to a fresh signed-out browser', async () => {
    const result = await request('/api/branding');
    expect(result.status).toBe(200); expect(result.cache).toBe('no-store');
    expect(result.body).toEqual({ success: true, data: { companyName: 'Cinnamon & Curry', companyLogo: '/uploads/logo.png' } });
    expect(mocks.select).toHaveBeenCalledWith('system.companyName system.companyLogo -_id');
    expect(JSON.stringify(result.body)).not.toContain('fixture-only-secret');
  });
  it.each(['/api/settings/system', '/api/settings/mail', '/api/settings/receipt', '/api/settings/receipt-config'])('keeps %s authenticated', async path => {
    expect((await request(path)).status).toBe(401); expect(mocks.read).not.toHaveBeenCalled();
  });
  it('uses consistent defaults when the database has no saved branding', async () => {
    mocks.read.mockResolvedValue(null);
    expect(await readPublicBranding()).toEqual({ companyName: 'ServeSmart', companyLogo: '' });
    mocks.read.mockResolvedValue({ system: { companyName: ' ', companyLogo: null } });
    expect(await readPublicBranding()).toEqual({ companyName: 'ServeSmart', companyLogo: '' });
  });
  it('returns fresh values on the next request and hides storage errors', async () => {
    await request('/api/branding');
    mocks.read.mockResolvedValue({ system: { companyName: 'New Kitchen', companyLogo: '' } });
    expect((await request('/api/branding')).body.data.companyName).toBe('New Kitchen');
    mocks.read.mockRejectedValue(new Error('fixture-only-secret'));
    const failed = await request('/api/branding');
    expect(failed.status).toBe(500); expect(JSON.stringify(failed.body)).not.toContain('fixture-only-secret');
  });
  it('brands account emails without interpreting business names as HTML or replacement tokens', () => {
    const content = brandEmailContent({ subject: 'Your {{companyName}} password', html: '<p>{{companyName}} Team</p><p>{{companyName}}</p>' }, 'A & B <Kitchen> $&');
    expect(content.subject).toBe('Your A & B <Kitchen> $& password');
    expect(content.html).toBe('<p>A &amp; B &lt;Kitchen&gt; $&amp; Team</p><p>A &amp; B &lt;Kitchen&gt; $&amp;</p>');
  });
});
