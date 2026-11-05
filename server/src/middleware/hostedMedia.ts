import { Request, Response, NextFunction } from 'express';
import media from '../config/portfolioMedia.json';
import { hostedPortfolio } from '../config/hostedPortfolio';

const images: Record<string, string> = media.products;
/** Response-only release media mapping. Never changes stored products/settings. */
export function portfolioMediaResponse(value: unknown): unknown {
  const plain = value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  function visit(node: any): any {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(visit);
    const result = Object.fromEntries(Object.entries(node).map(([key, child]) => [key, visit(child)]));
    const id = typeof node._id === 'string' ? node._id : typeof node.id === 'string' ? node.id : typeof node.productId === 'string' ? node.productId : '';
    if (images[id]) result.image = images[id];
    if (Object.prototype.hasOwnProperty.call(node, 'companyLogo')) result.companyLogo = media.logo;
    return result;
  }
  return visit(plain);
}
export function hostedMediaResponses(_req: Request, res: Response, next: NextFunction) {
  if (hostedPortfolio()) {
    const send = res.json.bind(res);
    res.json = (body: unknown) => send(portfolioMediaResponse(body));
  }
  next();
}

/** An editor can echo a release-only image alias when saving unrelated fields.
 * Omit that alias so existing partial-update contracts retain the stored image. */
export function preserveStoredMedia(req: Request) {
  if (!hostedPortfolio() || req.method !== 'PUT' || !req.body || typeof req.body !== 'object') return;
  const route = req.path.replace(/\/$/, '');
  const id = route.match(/^\/products\/([a-f0-9]{24})$/i)?.[1];
  if (id && images[id] && req.body.image === images[id]) delete req.body.image;
  if (route === '/settings/system') {
    if (req.body.system?.companyLogo === media.logo) delete req.body.system.companyLogo;
    if (req.body['system.companyLogo'] === media.logo) delete req.body['system.companyLogo'];
  }
}
