import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function StepWizardContainer({
  step,
  totalSteps,
  title,
  subtitle,
  onBack,
  children
}) {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-lg mx-auto bg-white rounded-3xl shadow-xl border-2 border-emerald-100 overflow-hidden flex flex-col min-h-[500px]">
      {/* Wizard Header */}
      <div className="bg-emerald-800 text-white p-4">
        <div className="flex items-center justify-between mb-3">
          {onBack ? (
            <button
              onClick={onBack}
              type="button"
              className="flex items-center justify-center min-w-[56px] min-h-[56px] rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500 active:scale-95 transition-all text-xl font-bold"
              aria-label="Go Back"
            >
              <ArrowLeft className="w-7 h-7" strokeWidth={3} />
            </button>
          ) : (
            <div className="w-14" />
          )}

          <div className="text-center">
            <span className="bg-yellow-400 text-emerald-950 px-4 py-1.5 rounded-full text-base font-black tracking-wider shadow">
              {step} / {totalSteps}
            </span>
          </div>

          <div className="w-14" />
        </div>

        {/* Progress Dots */}
        <div className="flex items-center justify-center gap-2 max-w-xs mx-auto py-1">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <div
              key={idx}
              className={`h-3.5 rounded-full transition-all duration-300 ${
                idx + 1 === step
                  ? 'w-10 bg-yellow-400 shadow-md ring-2 ring-yellow-200'
                  : idx + 1 < step
                  ? 'w-4 bg-emerald-400'
                  : 'w-3 bg-emerald-900/60'
              }`}
            />
          ))}
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-black text-center text-yellow-300 mt-2 leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-center text-emerald-100 text-base font-semibold mt-1">
            {subtitle}
          </p>
        )}
      </div>

      {/* Wizard Step Body */}
      <div className="p-5 flex-1 flex flex-col justify-between gap-6">
        {children}
      </div>
    </div>
  );
}
