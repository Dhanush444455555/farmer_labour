import { useTranslation } from 'react-i18next';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import BigActionButton from '../common/BigActionButton';

export default function LaborerAvailabilityHero({ onSelectStatus, loading = false }) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-3xl p-6 border-4 border-emerald-300 shadow-2xl flex flex-col gap-6 text-center max-w-lg mx-auto">
      <div className="flex flex-col items-center gap-2">
        <span className="text-6xl animate-bounce">☀️</span>
        <h2 className="text-2xl sm:text-3xl font-black text-emerald-950 leading-tight">
          {t('laborer.hero_title', 'Are you working tomorrow?')}
        </h2>
        <p className="text-gray-600 font-bold text-base">
          {t('laborer.hero_subtitle', 'Tap one button to let farm owners know')}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Giant YES Button (76px) */}
        <BigActionButton
          onClick={() => onSelectStatus('AVAILABLE')}
          disabled={loading}
          variant="green"
          size="xl"
          icon={ThumbsUp}
          className="ring-4 ring-emerald-200"
        >
          {t('laborer.ready_btn', '👍 YES, I WANT WORK')}
        </BigActionButton>

        {/* Giant NO Button (76px) */}
        <BigActionButton
          onClick={() => onSelectStatus('NOT_AVAILABLE')}
          disabled={loading}
          variant="red"
          size="xl"
          icon={ThumbsDown}
          className="ring-4 ring-rose-200"
        >
          {t('laborer.rest_btn', '👎 NO, I AM RESTING')}
        </BigActionButton>
      </div>
    </div>
  );
}
