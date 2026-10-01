import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function VisualStatusBadge({ status, customText = null, size = 'md' }) {
  const { t } = useTranslation();

  const sizeClasses = {
    sm: 'text-sm py-1 px-2.5 gap-1.5 min-h-[36px]',
    md: 'text-base py-2 px-3.5 gap-2 min-h-[44px]',
    lg: 'text-lg py-3 px-5 gap-2.5 min-h-[56px] font-bold'
  };

  const normalizedStatus = (status || '').toUpperCase();

  if (normalizedStatus === 'AVAILABLE' || normalizedStatus === 'OPEN' || normalizedStatus === 'ACTIVE' || normalizedStatus === 'YES') {
    return (
      <span className={`inline-flex items-center rounded-2xl bg-emerald-100 text-emerald-900 border-2 border-emerald-500 font-extrabold shadow-sm ${sizeClasses[size]}`}>
        <span className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse inline-block shrink-0" />
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        <span>{customText || t('common.status_available', 'AVAILABLE')}</span>
      </span>
    );
  }

  if (normalizedStatus === 'PENDING' || normalizedStatus === 'REQUESTED' || normalizedStatus === 'WAITING') {
    return (
      <span className={`inline-flex items-center rounded-2xl bg-amber-100 text-amber-950 border-2 border-amber-400 font-extrabold shadow-sm ${sizeClasses[size]}`}>
        <span className="w-4 h-4 rounded-full bg-amber-500 inline-block shrink-0" />
        <Clock className="w-5 h-5 text-amber-700 shrink-0" />
        <span>{customText || t('common.status_pending', 'PENDING')}</span>
      </span>
    );
  }

  // Default to RED / Filled / Resting / Closed
  return (
    <span className={`inline-flex items-center rounded-2xl bg-rose-100 text-rose-950 border-2 border-rose-500 font-extrabold shadow-sm ${sizeClasses[size]}`}>
      <span className="w-4 h-4 rounded-full bg-rose-500 inline-block shrink-0" />
      <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
      <span>{customText || t('common.status_filled', 'FILLED / RESTING')}</span>
    </span>
  );
}
