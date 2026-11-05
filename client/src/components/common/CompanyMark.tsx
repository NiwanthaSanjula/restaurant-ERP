import { useState } from 'react';
import { useBranding } from '../../contexts/BrandingProvider';
import { brandInitials, DEFAULT_COMPANY_LOGO, DEFAULT_COMPANY_NAME, resolveBrandLogo } from '../../services/branding';

export default function CompanyMark({ className = 'w-10 h-10' }: { className?: string }) {
  const { companyName, companyLogo } = useBranding();
  const [failedLogos, setFailedLogos] = useState<string[]>([]);
  const candidates = [resolveBrandLogo(companyLogo), ...(companyLogo && companyName === DEFAULT_COMPANY_NAME ? [DEFAULT_COMPANY_LOGO] : [])];
  const logo = candidates.find(candidate => candidate && !failedLogos.includes(candidate));
  return logo ? (
    <img src={logo} alt={`${companyName} logo`} className={`shrink-0 object-contain border border-line rounded-xl ${className}`} onError={() => setFailedLogos(previous => [...previous, logo])} />
  ) : (
    <span aria-label={companyName} title={companyName} className={`ss-brand-mark shrink-0 flex items-center justify-center ${className}`}>{brandInitials(companyName)}</span>
  );
}
