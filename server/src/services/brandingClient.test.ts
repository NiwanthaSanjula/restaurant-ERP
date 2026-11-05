import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const root = path.resolve(__dirname, '../../../client/src/services');
const compile = (file: string) => ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8').replace('import.meta.env.VITE_API_URL', 'undefined'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(storageFails = false, cached?: { companyName: string; companyLogo: string }) {
  const entries = new Map<string, string>();
  if (cached) entries.set('servesmart.branding', JSON.stringify(cached));
  const storage = { getItem: (key: string) => { if (storageFails) throw Error('Storage blocked'); return entries.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (storageFails) throw Error('Storage blocked'); entries.set(key, value); } };
  const branding = new Function('exports', 'localStorage', compile('branding.ts') + ';return exports;')({}, storage);
  const api = { get: jest.fn(), put: jest.fn(), interceptors: { request: { use: jest.fn() } } };
  const service = new Function('exports', 'require', 'localStorage', compile('settingService.ts') + ';return exports;')({},
    name => name === 'axios' ? { __esModule: true, default: { create: () => api } } : branding, storage).settingService;
  return { entries, branding, api, service };
}

describe('shared live business branding', () => {
  it('starts signed-out browsers with the bundled restaurant identity, including unavailable storage', () => {
    for (const storageFails of [false, true]) {
      const { branding } = fixture(storageFails);
      expect(branding.getBranding()).toEqual({ companyName: 'La Tavola', companyLogo: '/portfolio-assets/la-tavola-logo.jpg' });
    }
  });
  it('replaces only the old empty-logo fallback cache and accepts subsequent configured settings', () => {
    const { branding } = fixture(false, { companyName: 'ServeSmart', companyLogo: '' });
    expect(branding.getBranding().companyName).toBe('La Tavola');
    expect(branding.getBranding().companyLogo).toBe('/portfolio-assets/la-tavola-logo.jpg');
    branding.syncBranding({ companyName: 'Renamed Restaurant', companyLogo: '/custom-logo.jpg' });
    expect(branding.getBranding()).toEqual({ companyName: 'Renamed Restaurant', companyLogo: '/custom-logo.jpg' });
    expect(fixture(false, { companyName: 'Saved Restaurant', companyLogo: '/saved-logo.jpg' }).branding.getBranding())
      .toEqual({ companyName: 'Saved Restaurant', companyLogo: '/saved-logo.jpg' });
    branding.syncBranding({ companyName: 'La Tavola', companyLogo: '' });
    expect(branding.getBranding().companyLogo).toBe('');
  });
  it('resolves bundled portfolio logos on the client origin without an API uploads dependency', () => {
    expect(fixture().branding.resolveBrandLogo('/portfolio-assets/la-tavola-logo.jpg')).toBe('/portfolio-assets/la-tavola-logo.jpg');
  });
  it('normalizes partial fields, defaults and initials without keeping unrelated settings', () => {
    const { branding } = fixture();
    expect(branding.normalizeBranding({ companyName: '  Lotus Kitchen  ', companyLogo: '/logo.png', password: 'fixture-only' })).toEqual({ companyName: 'Lotus Kitchen', companyLogo: '/logo.png' });
    expect(branding.brandInitials('Lotus Kitchen')).toBe('LK'); expect(branding.brandInitials('ServeSmart')).toBe('SS');
    expect(branding.brandInitials('Café')).toBe('CA');
    branding.syncBranding({ companyName: 'Lotus Kitchen', companyLogo: '/logo.png' });
    branding.syncBranding({ currency: 'EUR' });
    expect(branding.getBranding()).toEqual({ companyName: 'Lotus Kitchen', companyLogo: '/logo.png' });
    branding.syncBranding({ companyName: ' ' }); expect(branding.getBranding().companyName).toBe('La Tavola');
  });
  it('notifies all consumers immediately only after a successful settings save and persists only public fields', async () => {
    const { branding, entries, api, service } = fixture(), listener = jest.fn();
    const unsubscribe = branding.subscribeBranding(listener);
    api.put.mockResolvedValue({ data: { success: true, data: { system: { companyName: 'Lotus Kitchen', companyLogo: '/logo.png', password: 'fixture-only' } } } });
    await service.updateSettings({ system: { companyName: 'Lotus Kitchen' } });
    expect(branding.getBranding().companyName).toBe('Lotus Kitchen'); expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(entries.get(branding.BRANDING_STORAGE_KEY))).toEqual({ companyName: 'Lotus Kitchen', companyLogo: '/logo.png' });
    api.put.mockRejectedValue(new Error('Denied'));
    await expect(service.updateSettings({ system: { companyName: 'Unsaved' } })).rejects.toThrow('Denied');
    expect(branding.getBranding().companyName).toBe('Lotus Kitchen'); expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe(); branding.syncBranding({ companyName: 'Changed again' }); expect(listener).toHaveBeenCalledTimes(1);
  });
  it('ignores stale in-flight reads after a saved rename', async () => {
    const { branding, api, service } = fixture(); let resolveRead: (value: unknown) => void;
    api.get.mockReturnValue(new Promise(resolve => { resolveRead = resolve; }));
    const reading = service.getSettings();
    branding.syncBranding({ companyName: 'New Kitchen' });
    resolveRead!({ data: { success: true, data: { system: { companyName: 'Old Kitchen' } } } }); await reading;
    expect(branding.getBranding().companyName).toBe('New Kitchen');
    const revision = branding.getBrandingRevision(); branding.syncBranding([]);
    expect(branding.getBrandingRevision()).toBe(revision);
  });
  it('continues in memory with unavailable storage and safely resolves logos/printed names', () => {
    const { branding } = fixture(true);
    expect(() => branding.syncBranding({ companyName: 'Offline Kitchen' })).not.toThrow();
    expect(branding.getBranding().companyName).toBe('Offline Kitchen');
    expect(branding.resolveBrandLogo('/uploads/logo.png')).toBe('http://localhost:5000/uploads/logo.png');
    expect(branding.resolveBrandLogo('https://assets.example.invalid/logo.png')).toBe('https://assets.example.invalid/logo.png');
    expect(branding.escapeBrandText('A & B <Kitchen>')).toBe('A &amp; B &lt;Kitchen&gt;');
  });
});
