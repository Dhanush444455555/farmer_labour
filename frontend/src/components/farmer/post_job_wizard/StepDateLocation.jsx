import { useTranslation } from 'react-i18next';
import { Sun, Calendar, MapPin, ArrowRight } from 'lucide-react';
import BigActionButton from '../../common/BigActionButton';

export default function StepDateLocation({
  dateOption,
  location,
  onChangeDateOption,
  onChangeLocation,
  onNext
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      {/* Date Options */}
      <div className="flex flex-col gap-3">
        <span className="text-gray-800 font-extrabold text-base text-center">
          Select Work Timing:
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChangeDateOption('Tomorrow Morning')}
            className={`
              flex items-center gap-3 p-4 min-h-[64px] rounded-2xl border-3 font-black text-left transition-all active:scale-95 shadow-md
              ${dateOption === 'Tomorrow Morning'
                ? 'bg-amber-400 text-amber-950 border-amber-600 ring-4 ring-amber-200'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-amber-50'
              }
            `}
          >
            <Sun className="w-8 h-8 text-amber-600 shrink-0 animate-spin-slow" />
            <div>
              <span className="text-lg font-black block">☀️ Tomorrow Morning</span>
              <span className="text-xs font-semibold text-gray-600">6:00 AM - 2:00 PM</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChangeDateOption('Today')}
            className={`
              flex items-center gap-3 p-4 min-h-[64px] rounded-2xl border-3 font-black text-left transition-all active:scale-95 shadow-md
              ${dateOption === 'Today'
                ? 'bg-amber-400 text-amber-950 border-amber-600 ring-4 ring-amber-200'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-amber-50'
              }
            `}
          >
            <Calendar className="w-8 h-8 text-blue-600 shrink-0" />
            <div>
              <span className="text-lg font-black block">📅 Today Urgent</span>
              <span className="text-xs font-semibold text-gray-600">Immediate start</span>
            </div>
          </button>
        </div>
      </div>

      {/* Location */}
      <div className="flex flex-col gap-2">
        <span className="text-gray-800 font-extrabold text-base">
          Farm Village / Location:
        </span>
        <div className="flex items-center bg-gray-50 border-2 border-emerald-400 rounded-2xl px-4 py-3 min-h-[56px] shadow-sm">
          <MapPin className="w-7 h-7 text-rose-500 shrink-0 mr-3" />
          <input
            type="text"
            value={location}
            onChange={(e) => onChangeLocation(e.target.value)}
            placeholder="Village name or landmark"
            className="w-full bg-transparent text-lg font-bold text-gray-900 outline-none"
          />
        </div>
      </div>

      {/* Next Button */}
      <BigActionButton onClick={onNext} variant="green" size="lg" icon={ArrowRight}>
        {t('common.next', 'NEXT')}
      </BigActionButton>
    </div>
  );
}
