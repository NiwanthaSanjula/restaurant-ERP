import { useState } from 'react';
import { useBranding } from '../../contexts/BrandingProvider';
import { brandInitials, resolveBrandLogo } from '../../services/branding';

export default function CompanyMark({ className = 'w-10 h-10' }: { className?: string }) {
  const { companyName, companyLogo } = useBranding();
  const logo = resolveBrandLogo(companyLogo);
  const [failedLogo, setFailedLogo] = useState('');
  return logo && logo !== failedLogo ? (
    <img src={logo} alt={`${companyName} logo`} className={`shrink-0 object-contain border border-line rounded-xl ${className}`} onError={() => setFailedLogo(logo)} />
  ) : (
    <span aria-label={companyName} title={companyName} className={`ss-brand-mark shrink-0 flex items-center justify-center ${className}`}>{brandInitials(companyName)}</span>
  );
}
