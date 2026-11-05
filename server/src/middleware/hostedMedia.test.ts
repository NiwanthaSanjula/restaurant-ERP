import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
import media from '../config/portfolioMedia.json';
import { hostedMediaResponses, portfolioMediaResponse, preserveStoredMedia } from './hostedMedia';

const original = process.env.PORTFOLIO_HOSTED_MODE;
afterEach(() => { if (original === undefined) delete process.env.PORTFOLIO_HOSTED_MODE; else process.env.PORTFOLIO_HOSTED_MODE = original; });
it('ships all approved logo/menu assets with verified hashes and 16 product mappings', () => {
  const root = path.resolve(__dirname, '../../../client/public');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'portfolio-assets/manifest.json'), 'utf8'));
  expect(Object.keys(media.products)).toHaveLength(16);
  for (const asset of manifest.approvedAssets) {
    const bytes = fs.readFileSync(path.join(root, 'portfolio-assets', asset.name));
    expect(bytes.length).toBe(asset.bytes); expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
  }
  for (const image of [media.logo, ...Object.values(media.products)]) {
    expect(image).toMatch(/^\/portfolio-assets\/[a-z-]+\.jpg$/); expect(fs.existsSync(path.join(root, image))).toBe(true);
  }
});
it('maps branding, catalog and product responses without changing stored inputs or financial zero values', () => {
  const id = Object.keys(media.products)[0], input = { data: { system: { companyName: 'La Tavola', companyLogo: 'http://localhost:5000/uploads/existing.jpg' },
    products: [{ _id: id, image: '', price: 0, quantity: 0 }, { productId: id, image: 'old' }, { _id: 'unrelated', image: 'untouched' }] } };
  const before = JSON.stringify(input), result: any = portfolioMediaResponse(input);
  expect(JSON.stringify(input)).toBe(before); expect(result.data.system.companyLogo).toBe(media.logo);
  expect(result.data.products[0]).toEqual({ _id: id, image: media.products[id], price: 0, quantity: 0 });
  expect(result.data.products[1].image).toBe(media.products[id]); expect(result.data.products[2].image).toBe('untouched');
});
it('only rewrites HTTP responses in hosted mode; local uploads/URLs remain unchanged', () => {
  const body = { companyLogo: 'http://localhost:5000/uploads/existing.jpg' };
  for (const hosted of [false, true]) {
    if (hosted) process.env.PORTFOLIO_HOSTED_MODE = '1'; else delete process.env.PORTFOLIO_HOSTED_MODE;
    const json = jest.fn(), res = { json } as unknown as Response, next = jest.fn();
    hostedMediaResponses({} as Request, res, next); res.json(body); expect(next).toHaveBeenCalledTimes(1);
    expect(json).toHaveBeenCalledWith(hosted ? { companyLogo: media.logo } : body);
  }
});
it('preserves stored media when hosted editor saves echo virtual aliases, and leaves ordinary updates intact', () => {
  process.env.PORTFOLIO_HOSTED_MODE = '1'; const id = Object.keys(media.products)[0];
  const product = { method: 'PUT', path: '/products/' + id, body: { image: media.products[id], name: 'Dish' } };
  preserveStoredMedia(product as Request); expect(product.body).toEqual({ name: 'Dish' });
  const settings = { method: 'PUT', path: '/settings/system', body: { system: { companyLogo: media.logo, companyName: 'La Tavola' }, 'system.companyLogo': media.logo } };
  preserveStoredMedia(settings as unknown as Request); expect(settings.body).toEqual({ system: { companyName: 'La Tavola' } });
  const normal = { method: 'PUT', path: '/products/' + id, body: { image: 'retained-existing-url' } };
  preserveStoredMedia(normal as Request); expect(normal.body.image).toBe('retained-existing-url');
  delete process.env.PORTFOLIO_HOSTED_MODE;
  const local = { method: 'PUT', path: '/products/' + id, body: { image: media.products[id] } };
  preserveStoredMedia(local as Request); expect(local.body.image).toBe(media.products[id]);
});
