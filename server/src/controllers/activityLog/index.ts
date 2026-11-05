import express from 'express';
import mongoose from 'mongoose';
import ActivityLog from '../../models/ActivityLog';
import Product from '../../models/Product';
import Purchase from '../../models/Purchase';
import Sale from '../../models/Sale';
import { AuthRequest } from '../../middleware/auth';
// Load pdfkit dynamically to avoid compile/runtime errors when not installed
let PDFDocument: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  PDFDocument = require('pdfkit');
} catch (e) {
  PDFDocument = null;
}

const toCSV = (rows: any[]) => {
  if (!rows || rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (s.includes(',') || s.includes('\n') || s.includes('"')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const header = keys.join(',');
  const body = rows.map(r => keys.map(k => escape(r[k])).join(',')).join('\n');
  return `${header}\n${body}`;
};

const isSaleReferenceFormat = (value: string): boolean => /^SALE-\d{4}$/i.test(value);

const formatSaleReference = (value: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (isSaleReferenceFormat(raw)) return raw.toUpperCase();

  const digits = raw.replace(/\D/g, '');
  if (digits.length > 0) {
    return `SALE-${digits.slice(-4).padStart(4, '0')}`;
  }

  const compact = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `SALE-${compact.slice(-4).padStart(4, '0')}`;
};

const getSaleDisplayId = (value?: unknown): string => {
  const raw = String(value || '').trim();
  return raw ? formatSaleReference(raw) : '';
};

export const getActivityLogs = async (req: express.Request, res: express.Response) => {
  try {
    const { from, to, module: moduleFilter, action, page = '1', limit = '20', download } = req.query as any;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.max(1, Math.min(1000, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * lim;

    const filter: any = {};
    if (moduleFilter) filter.entityType = moduleFilter;
    if (action) filter.action = action;
    if (from || to) filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(String(from));
    if (to) {
      const t = new Date(String(to));
      // include whole day when only date provided
      t.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = t;
    }

    const total = await ActivityLog.countDocuments(filter);
    const demo = (req as AuthRequest).isDemo === true;
    const query = ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim);
    if (demo) query.select('_id action entityType entityId createdAt');
    const docs = await query.lean();

    // Map entityId to human-friendly identifiers when possible
    const byType: Record<string, Set<string>> = {};
    for (const d of docs) {
      if (!d || !d.entityType || !d.entityId) continue;
      byType[d.entityType] = byType[d.entityType] || new Set<string>();
      // only try to map if looks like an ObjectId
      if (typeof d.entityId === 'string' && mongoose.isValidObjectId(d.entityId)) {
        byType[d.entityType].add(d.entityId);
      }
    }

    const mapped: Record<string, Record<string, any>> = {};
    // Batch lookup per entity type
    if (byType['Product'] && byType['Product'].size > 0) {
      const ids = Array.from(byType['Product']);
      const rows = await Product.find({ _id: { $in: ids } }).select('code').lean();
      mapped['Product'] = {};
      for (const r of rows) mapped['Product'][String(r._id)] = r.code || String(r._id);
    }
    if (byType['Sale'] && byType['Sale'].size > 0) {
      const ids = Array.from(byType['Sale']);
      const rows = await Sale.find({ _id: { $in: ids } }).select('invoiceId').lean();
      mapped['Sale'] = {};
      for (const r of rows) mapped['Sale'][String(r._id)] = getSaleDisplayId(r.invoiceId || String(r._id));
    }
    if (byType['Purchase'] && byType['Purchase'].size > 0) {
      const ids = Array.from(byType['Purchase']);
      const rows = await Purchase.find({ _id: { $in: ids } }).select('purchaseId').lean();
      mapped['Purchase'] = {};
      for (const r of rows) mapped['Purchase'][String(r._id)] = r.purchaseId || String(r._id);
    }

    // Apply mapping to docs (add displayEntityId field and replace entityId when possible)
    for (const d of docs) {
      (d as any).displayEntityId = d.entityId;
      try {
        if (d && d.entityType && d.entityId && mapped[d.entityType] && mapped[d.entityType][String(d.entityId)]) {
          (d as any).displayEntityId = mapped[d.entityType][String(d.entityId)];
        }
      } catch (e) {
        // ignore mapping errors
      }
      // Fallback: if still an ObjectId or not human-friendly, try to extract from `before` snapshot
      try {
        const cur = (d as any).displayEntityId;
        const before = d.before || {};
        if (d.entityType === 'Product') {
          if (before && before.code) (d as any).displayEntityId = before.code;
        } else if (d.entityType === 'Sale') {
          (d as any).displayEntityId = getSaleDisplayId(
            before?.invoiceId ||
            (d as any).displayEntityId ||
            d.entityId
          );
        } else if (d.entityType === 'Purchase') {
          if (before && before.purchaseId) (d as any).displayEntityId = before.purchaseId;
        }
        // if displayEntityId is still the raw ObjectId string, leave as-is
      } catch (e) {
        // ignore
      }
    }

    if (download === 'true' || download === true || String(download).toLowerCase() === 'csv') {
      // Build CSV rows
      const rows = docs.map((d: any) => demo ? ({ createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : '', action: d.action, entityType: d.entityType, entityId: d.displayEntityId || d.entityId }) : ({
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : '',
        userId: d.userId || '',
        username: d.username || '',
        role: d.role || '',
        action: d.action,
        entityType: d.entityType,
        entityId: (d as any).displayEntityId || d.entityId,
        before: JSON.stringify(d.before || ''),
        after: JSON.stringify(d.after || ''),
        metadata: JSON.stringify(d.metadata || '')
      }));

      const csv = toCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="activity-logs.csv"');
      res.send(csv);
      return;
    }

    // If PDF requested: generate a simple PDF table
    if (String(download).toLowerCase() === 'pdf') {
      if (!PDFDocument) {
        res.status(500).json({ status: 'error', message: 'PDF export is not available on this server. Please install pdfkit.' });
        return;
      }
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer | Uint8Array) => buffers.push(Buffer.from(chunk as any)));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        res.setHeader('Content-Type', 'application/pdf');
        const fromStr = from ? String(from) : 'start';
        const toStr = to ? String(to) : 'end';
        res.setHeader('Content-Disposition', `attachment; filename="activity-logs-${fromStr}-${toStr}.pdf"`);
        res.send(pdfData);
      });

      // Header
      doc.fontSize(16).text('Activity Logs', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Date range: ${from || 'Any'} → ${to || 'Any'}`);
      doc.moveDown(0.5);

      // Table header
      const headers = ['Time', 'User', 'Role', 'Action', 'Module', 'Entity ID'];
      const columnWidths = [120, 100, 80, 60, 80, 120];

      // draw header row
      doc.fontSize(9).font('Helvetica-Bold');
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], { continued: i !== headers.length - 1, width: columnWidths[i] });
      }
      doc.moveDown(0.3);
      doc.font('Helvetica');

      // rows
      for (const r of docs) {
        const time = r.createdAt ? new Date(r.createdAt).toLocaleString() : '';
        const user = r.username || r.userId || '';
        const role = r.role || '';
        const actionStr = r.action || '';
        const moduleStr = r.entityType || '';
        const entityStr = (r as any).displayEntityId || r.entityId || '';

        const cells = [time, user, role, actionStr, moduleStr, entityStr];
        for (let i = 0; i < cells.length; i++) {
          doc.text(String(cells[i]), { continued: i !== cells.length - 1, width: columnWidths[i] });
        }
        doc.moveDown(0.3);
        // paginate if close to bottom
        if (doc.y > 700) doc.addPage();
      }

      doc.end();
      return;
    }

    // Replace entityId with displayEntityId when available for client convenience
    const outDocs = docs.map((d: any) => ({
      ...d,
      username: d.username || '',
      role: d.role || '',
      entityId: (d as any).displayEntityId || d.entityId
    }));

    res.json({ status: 'success', data: { total, page: pageNum, limit: lim, results: outDocs } });
  } catch (err: any) {
    console.error('Error fetching activity logs:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch activity logs' });
  }
};

export const downloadActivityLogs = async (req: express.Request, res: express.Response) => {
  const requestWithDownload = req as express.Request & { query: Record<string, any> };
  requestWithDownload.query = { ...requestWithDownload.query, download: 'csv' };
  return getActivityLogs(requestWithDownload, res);
};

export default getActivityLogs;
