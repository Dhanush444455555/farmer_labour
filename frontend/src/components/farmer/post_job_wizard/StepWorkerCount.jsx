import { Minus, Plus, Users, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BigActionButton from '../../common/BigActionButton';

export default function StepWorkerCount({ count, gender, onChangeCount, onChangeGender, onNext }) {
  const { t } = useTranslation();

  const handleDecrement = () => {
    if (count > 1) onChangeCount(count - 1);
  };

  const handleIncrement = () => {
    if (count < 50) onChangeCount(count + 1);
  };

  const GENDER_OPTIONS = [
    { id: 'Any', icon: '👥', labelKey: 'farmer.any_workers', defaultLabel: '👥 Any' },
    { id: 'Male', icon: '👨', labelKey: 'farmer.men_workers', defaultLabel: '👨 Men' },
    { id: 'Female', icon: '👩', labelKey: 'farmer.women_workers', defaultLabel: '👩 Women' }
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Big Counter */}
      <div className="bg-emerald-50 border-3 border-emerald-300 rounded-3xl p-5 text-center shadow-inner">
        <span className="text-emerald-900 font-extrabold text-lg uppercase tracking-wider block mb-2">
          {t('common.persons', 'Workers Needed')}
        </span>

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={handleDecrement}
            disabled={count <= 1}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center text-3xl font-black shadow-lg active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            aria-label="Decrease workers"
          >
            <Minus className="w-10 h-10" strokeWidth={3.5} />
          </button>

          <div className="min-w-[100px] py-2 px-4 bg-white rounded-2xl border-4 border-emerald-500 shadow-md">
            <span className="text-5xl sm:text-6xl font-black text-emerald-950 block">
              {count}
            </span>
          </div>

          <button
            type="button"
            onClick={handleIncrement}
            disabled={count >= 50}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center text-3xl font-black shadow-lg active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            aria-label="Increase workers"
          >
            <Plus className="w-10 h-10" strokeWidth={3.5} />
          </button>
        </div>
      </div>

      {/* Gender Selection */}
      <div className="flex flex-col gap-2">
        <span className="text-gray-700 font-black text-base text-center">
          Worker Preference:
        </span>
        <div className="grid grid-cols-3 gap-2">
          {GENDER_OPTIONS.map((g) => {
            const isSelected = gender === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onChangeGender(g.id)}
                className={`
                  flex flex-col items-center justify-center p-3 min-h-[60px] rounded-2xl border-3 font-black transition-all active:scale-95 shadow-sm
                  ${isSelected ? 'bg-emerald-600 text-white border-emerald-800 ring-2 ring-emerald-300' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-100'}
                `}
              >
                <span className="text-3xl mb-1">{g.icon}</span>
                <span className="text-xs sm:text-sm">{t(g.labelKey, g.defaultLabel)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Next Button */}
      <BigActionButton onClick={onNext} variant="green" size="lg" icon={ArrowRight}>
        {t('common.next', 'NEXT')}
      </BigActionButton>
    </div>
  );
}
