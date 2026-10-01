import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';

const WORK_TYPES = [
  { id: 'Harvesting', icon: '🌾', labelKey: 'farmer.harvesting', defaultLabel: '🌾 Harvesting', color: 'border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100' },
  { id: 'Weeding', icon: '🌱', labelKey: 'farmer.weeding', defaultLabel: '🌱 Weeding', color: 'border-emerald-400 bg-emerald-50 text-emerald-950 hover:bg-emerald-100' },
  { id: 'Plowing', icon: '🚜', labelKey: 'farmer.plowing', defaultLabel: '🚜 Plowing', color: 'border-blue-400 bg-blue-50 text-blue-950 hover:bg-blue-100' },
  { id: 'Spraying', icon: '💧', labelKey: 'farmer.spraying', defaultLabel: '💧 Spraying', color: 'border-cyan-400 bg-cyan-50 text-cyan-950 hover:bg-cyan-100' },
  { id: 'Sowing', icon: '🌿', labelKey: 'farmer.sowing', defaultLabel: '🌿 Planting / Sowing', color: 'border-teal-400 bg-teal-50 text-teal-950 hover:bg-teal-100' },
  { id: 'General', icon: '👨‍🌾', labelKey: 'farmer.general', defaultLabel: '👨‍🌾 General Work', color: 'border-orange-400 bg-orange-50 text-orange-950 hover:bg-orange-100' }
];

export default function StepWorkType({ selectedType, onSelect }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {WORK_TYPES.map((item) => {
          const isSelected = selectedType === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`
                flex items-center gap-4 p-4 min-h-[72px] rounded-2xl border-4 text-left font-black transition-all active:scale-95 shadow-md
                ${isSelected ? 'border-emerald-600 bg-emerald-500 text-white ring-4 ring-emerald-200 scale-[1.02]' : item.color}
              `}
            >
              <span className="text-4xl shrink-0 filter drop-shadow">{item.icon}</span>
              <span className="text-xl sm:text-2xl leading-tight">
                {t(item.labelKey, item.defaultLabel)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
