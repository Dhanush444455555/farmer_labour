import { useTranslation } from 'react-i18next';
import { ArrowRight, IndianRupee } from 'lucide-react';
import BigActionButton from '../../common/BigActionButton';

const WAGE_PRESETS = [400, 500, 600, 700, 800, 1000];

export default function StepWageSelection({ wage, onChangeWage, onNext }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      {/* Current Selection Display */}
      <div className="bg-yellow-50 border-4 border-yellow-400 rounded-3xl p-4 text-center shadow-inner">
        <span className="text-yellow-900 font-extrabold text-sm uppercase tracking-wider block mb-1">
          Daily Wage Selected
        </span>
        <div className="flex items-center justify-center gap-1 text-emerald-900">
          <span className="text-4xl sm:text-5xl font-black">₹</span>
          <span className="text-5xl sm:text-6xl font-black">{wage || 0}</span>
          <span className="text-base font-bold text-gray-600 ml-2">/ day</span>
        </div>
      </div>

      {/* Wage Preset Grid */}
      <div className="grid grid-cols-3 gap-2.5">
        {WAGE_PRESETS.map((amount) => {
          const isSelected = Number(wage) === amount;
          return (
            <button
              key={amount}
              type="button"
              onClick={() => onChangeWage(amount)}
              className={`
                flex flex-col items-center justify-center p-3 min-h-[64px] rounded-2xl border-3 font-black transition-all active:scale-95 shadow-md
                ${isSelected
                  ? 'bg-emerald-600 text-white border-emerald-800 ring-4 ring-emerald-200 scale-105'
                  : 'bg-white text-gray-900 border-emerald-200 hover:bg-emerald-50'
                }
              `}
            >
              <span className="text-2xl sm:text-3xl font-black">₹{amount}</span>
            </button>
          );
        })}
      </div>

      {/* Manual Input for other amounts */}
      <div className="flex items-center bg-gray-50 border-2 border-gray-300 rounded-2xl px-4 py-2 min-h-[56px] focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-200">
        <IndianRupee className="w-6 h-6 text-gray-500 shrink-0 mr-2" />
        <input
          type="number"
          value={wage}
          onChange={(e) => onChangeWage(Number(e.target.value))}
          placeholder="Enter other amount (e.g. 550)"
          className="w-full bg-transparent text-xl font-bold text-gray-900 outline-none"
        />
      </div>

      {/* Next Button */}
      <BigActionButton
        onClick={onNext}
        disabled={!wage || wage <= 0}
        variant="green"
        size="lg"
        icon={ArrowRight}
      >
        {t('common.next', 'NEXT')}
      </BigActionButton>
    </div>
  );
}
