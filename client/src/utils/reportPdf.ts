import { escapeBrandText, getBranding } from '../services/branding';

type ReportColumn = {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
};

type ReportPdfOptions = {
  title: string;
  fileName?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number>>;
  summary?: Array<{ label: string; value: string }>;
  filters?: Array<{ label: string; value: string }>;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const alignClass = (align?: 'left' | 'right' | 'center'): string => {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
};

export const exportReportPdf = ({
  title,
  columns,
  rows,
  summary = [],
  filters = [],
}: ReportPdfOptions): void => {
  const now = new Date();
  const generatedAt = now.toLocaleString();

  const headHtml = columns
    .map((col) => `<th class="${alignClass(col.align)}">${escapeHtml(col.header)}</th>`)
    .join('');

  const bodyHtml =
    rows.length > 0
      ? rows
          .map((row) => {
            const cells = columns
              .map((col) => {
                const raw = row[col.key] ?? '-';
                const value = typeof raw === 'number' ? String(raw) : raw;
                return `<td class="${alignClass(col.align)}">${escapeHtml(value)}</td>`;
              })
              .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('')
      : `<tr><td colspan="${columns.length}" class="text-center">No data available.</td></tr>`;

  const filtersHtml =
    filters.length > 0
      ? `<div class="meta"><strong>Filters:</strong> ${filters
          .map((f) => `${escapeHtml(f.label)}: ${escapeHtml(f.value)}`)
          .join(' | ')}</div>`
      : '';

  const summaryHtml =
    summary.length > 0
      ? `<div class="summary">${summary
          .map(
            (s) =>
              `<div class="summary-item"><span>${escapeHtml(s.label)}</span><strong>${escapeHtml(
                s.value
              )}</strong></div>`
          )
          .join('')}</div>`
      : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @media print { @page { margin: 12mm; } }
    body { font-family: Arial, sans-serif; color: #111827; margin: 0; padding: 0; }
    .container { padding: 12px; }
    h1 { margin: 0 0 8px 0; font-size: 22px; }
    .meta { margin: 4px 0 10px 0; font-size: 12px; color: #374151; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; }
    th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .text-center { text-align: center; }
    .summary { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
    .summary-item { border: 1px solid #d1d5db; padding: 8px 10px; border-radius: 6px; font-size: 12px; }
    .summary-item span { margin-right: 8px; color: #4b5563; }
    .footer { margin-top: 10px; font-size: 11px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta"><strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
    ${filtersHtml}
    <table>
      <thead><tr>${headHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
    ${summaryHtml}
    <div class="footer">Exported from ${escapeBrandText(getBranding().companyName)} Reports</div>
  </div>
</body>
</html>`;

  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const doc = frame.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(frame);
    throw new Error('Failed to initialize print preview');
  }

  doc.open();
  doc.write(html);
  doc.close();

  frame.onload = () => {
    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      const cleanup = () => {
        if (document.body.contains(frame)) {
          document.body.removeChild(frame);
        }
      };
      frame.contentWindow?.addEventListener('afterprint', cleanup);
      setTimeout(cleanup, 1200);
    }, 250);
  };
};

