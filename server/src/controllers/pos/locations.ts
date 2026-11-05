import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import Warehouse from '../../models/Warehouse';
import Setting from '../../models/Setting';

/** No per-user warehouse assignments exist. Canonical POS/settings read grants
 * authorize these safe options; inactive/missing records are never selectable. */
export async function getPosLocations(_req: AuthRequest, res: Response) {
  try {
    const [locations, settings] = await Promise.all([
      Warehouse.find({ isActive: true }).select('_id name isActive').sort({ name: 1 }).lean(),
      Setting.findOne().select('system.defaultPosWarehouseId').lean()
    ]);
    const configured = settings?.system?.defaultPosWarehouseId;
    const defaultWarehouseId = locations.some(location => String(location._id) === configured) ? configured : null;
    return res.json({ status: 'success', data: { locations, defaultWarehouseId } });
  } catch { return res.status(503).json({ status: 'error', message: 'Selling locations could not be loaded. Please retry.' }); }
}
