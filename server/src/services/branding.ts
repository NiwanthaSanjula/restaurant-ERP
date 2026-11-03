import Setting from '../models/Setting';

export const DEFAULT_COMPANY_NAME = 'ServeSmart';

/** Only deliberate public display fields may leave this projection. */
export async function readPublicBranding(): Promise<{ companyName: string; companyLogo: string }> {
  const settings = await Setting.findOne().select('system.companyName system.companyLogo -_id').lean();
  return {
    companyName: typeof settings?.system?.companyName === 'string' ? settings.system.companyName.trim() || DEFAULT_COMPANY_NAME : DEFAULT_COMPANY_NAME,
    companyLogo: typeof settings?.system?.companyLogo === 'string' ? settings.system.companyLogo.trim() : ''
  };
}

export const escapeBrandText = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));

export function brandEmailContent(content: { subject: string; html: string }, companyName: string): { subject: string; html: string } {
  return {
    subject: content.subject.replace(/\{\{companyName\}\}/g, () => companyName.replace(/[\r\n]+/g, ' ')),
    html: content.html.replace(/\{\{companyName\}\}/g, () => escapeBrandText(companyName))
  };
}
