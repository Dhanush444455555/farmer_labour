import { useTranslation } from 'react-i18next';
import { Send, Phone, ClipboardList, LogOut, Mic } from 'lucide-react';
import VoiceInputButton from '../common/VoiceInputButton';

export default function FarmerActionHub({
  user,
  onStartPostJob,
  onOpenDirectory,
  onOpenMyJobs,
  onLogout
}) {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-5 py-2">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-800 to-emerald-900 rounded-3xl p-5 text-white shadow-xl border-3 border-emerald-600 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-16 h-16 rounded-2xl bg-yellow-400 text-emerald-950 flex items-center justify-center text-3xl font-black shadow-md shrink-0">
            👨‍🌾
          </div>
          <div>
            <span className="text-emerald-200 text-xs font-black uppercase tracking-wider block">
              {t('owner_dash.farm_owner', 'Farm Owner')}
            </span>
            <h2 className="text-2xl font-black text-white leading-tight">
              {user?.name || 'Farmer'}
            </h2>
            <span className="text-emerald-200 text-sm font-bold">
              {user?.phone}
            </span>
          </div>
        </div>

        <button
          onClick={onLogout}
          type="button"
          className="flex flex-col items-center justify-center min-w-[56px] min-h-[56px] px-3 rounded-2xl bg-rose-700/80 hover:bg-rose-700 text-white font-black text-xs border border-rose-400 active:scale-95 transition-all"
          aria-label="Logout"
        >
          <LogOut className="w-6 h-6 mb-0.5" />
          <span>Exit</span>
        </button>
      </div>

      {/* Voice Assistant Fast Trigger */}
      <div className="bg-amber-50 border-3 border-amber-400 rounded-3xl p-4 shadow-md flex flex-col gap-2">
        <span className="text-xs font-black uppercase text-amber-900 text-center tracking-wider">
          🎙️ Quick Voice Post
        </span>
        <VoiceInputButton
          onSpeechResult={() => onStartPostJob()}
          label="Tap & Speak to Post Job"
          hint='Say: "Need 3 workers tomorrow for harvesting 500 rupees"'
        />
      </div>

      {/* Primary Action 1: POST A NEW JOB (Giant Card) */}
      <button
        type="button"
        onClick={onStartPostJob}
        className="w-full text-left p-6 rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white border-4 border-emerald-400 shadow-2xl transition-all active:scale-[0.98] cursor-pointer flex items-center gap-5 group"
      >
        <div className="w-20 h-20 rounded-2xl bg-yellow-400 text-emerald-950 flex items-center justify-center text-5xl shadow-lg shrink-0 group-hover:scale-110 transition-transform">
          📢
        </div>
        <div className="flex-1">
          <span className="inline-block bg-yellow-300 text-emerald-950 text-xs font-black uppercase px-2.5 py-0.5 rounded-full mb-1.5 shadow-sm">
            Fast 1-Minute
          </span>
          <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            {t('farmer.post_job_card', '📢 POST NEW WORK')}
          </h3>
          <p className="text-emerald-100 text-sm sm:text-base font-bold mt-1">
            {t('farmer.post_job_desc', 'Send work alert to all ready workers')}
          </p>
        </div>
      </button>

      {/* Primary Action 2: CALL WORKERS DIRECTLY (Giant Card) */}
      <button
        type="button"
        onClick={onOpenDirectory}
        className="w-full text-left p-6 rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-4 border-blue-400 shadow-2xl transition-all active:scale-[0.98] cursor-pointer flex items-center gap-5 group"
      >
        <div className="w-20 h-20 rounded-2xl bg-white text-blue-900 flex items-center justify-center text-5xl shadow-lg shrink-0 group-hover:scale-110 transition-transform">
          📞
        </div>
        <div className="flex-1">
          <span className="inline-block bg-blue-200 text-blue-950 text-xs font-black uppercase px-2.5 py-0.5 rounded-full mb-1.5 shadow-sm">
            Direct Phone
          </span>
          <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            {t('farmer.call_workers_card', '👥 CALL WORKERS')}
          </h3>
          <p className="text-blue-100 text-sm sm:text-base font-bold mt-1">
            {t('farmer.call_workers_desc', 'See available laborers and call now')}
          </p>
        </div>
      </button>

      {/* Secondary Action: MY ACTIVE JOBS */}
      <button
        type="button"
        onClick={onOpenMyJobs}
        className="w-full p-4 min-h-[64px] rounded-2xl bg-white hover:bg-emerald-50 text-emerald-950 border-3 border-emerald-300 font-black text-lg sm:text-xl shadow-md flex items-center justify-center gap-3 active:scale-95 transition-all"
      >
        <ClipboardList className="w-7 h-7 text-emerald-700" />
        <span>{t('farmer.my_jobs_card', '📋 My Active Jobs & Bookings')}</span>
      </button>
    </div>
  );
}
