import { useTranslation } from 'react-i18next';
import { Phone, MapPin, IndianRupee, Check, X, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import VisualStatusBadge from '../common/VisualStatusBadge';
import BigActionButton from '../common/BigActionButton';

export const cardItemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.12 } }
};

export default function LaborerJobCard({
  job,
  onAccept,
  onReject,
  isAccepted,
  isFull
}) {
  const { t } = useTranslation();

  const getWorkIcon = (type) => {
    const tLower = (type || '').toLowerCase();
    if (tLower.includes('harvest')) return '🌾';
    if (tLower.includes('weed')) return '🌱';
    if (tLower.includes('plow')) return '🚜';
    if (tLower.includes('spray')) return '💧';
    if (tLower.includes('sow') || tLower.includes('plant')) return '🌿';
    return '👨‍🌾';
  };

  return (
    <motion.div
      variants={cardItemVariants}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className="bg-white rounded-3xl p-5 border-4 border-emerald-200 shadow-xl flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-4xl sm:text-5xl shrink-0 filter drop-shadow">
            {getWorkIcon(job.workType)}
          </span>
          <div>
            <h3 className="text-2xl font-black text-gray-900 leading-tight">
              {job.workType || 'Farm Work'}
            </h3>
            <p className="text-sm font-bold text-gray-500">
              {job.date || 'Tomorrow Morning'}
            </p>
          </div>
        </div>

        <VisualStatusBadge
          status={isFull ? 'CLOSED' : isAccepted ? 'ACTIVE' : 'OPEN'}
          customText={isFull ? 'FILLED 🔴' : isAccepted ? 'ACCEPTED 🟢' : 'OPEN 🟢'}
          size="sm"
        />
      </div>

      {/* Wage & Details Box */}
      <div className="grid grid-cols-2 gap-2 bg-emerald-50 p-3.5 rounded-2xl border-2 border-emerald-200">
        <div className="flex items-center gap-2">
          <IndianRupee className="w-6 h-6 text-emerald-700 shrink-0" />
          <div>
            <span className="text-xs font-bold text-gray-500 block">Daily Wage</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-900">
              ₹{job.wage || 0}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-600 shrink-0" />
          <div>
            <span className="text-xs font-bold text-gray-500 block">Needed</span>
            <span className="text-base sm:text-lg font-black text-gray-900">
              {job.workersCount || 1} ({job.genderPreference || 'Any'})
            </span>
          </div>
        </div>
      </div>

      {/* Location */}
      <div className="flex items-center gap-2 text-gray-700 bg-gray-50 p-3 rounded-2xl border border-gray-200">
        <MapPin className="w-5 h-5 text-rose-500 shrink-0" />
        <span className="text-base font-bold truncate">
          {job.location || 'Local Farm'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2.5 pt-1">
        {isAccepted ? (
          <div className="flex flex-col gap-2">
            <div className="bg-emerald-100 text-emerald-950 p-3 rounded-2xl text-center font-black text-lg border-2 border-emerald-400 flex items-center justify-center gap-2">
              <Check className="w-6 h-6 text-emerald-600" />
              <span>{t('laborer.already_accepted', 'JOB ACCEPTED ✓')}</span>
            </div>

            {job.hirerPhone && (
              <motion.a
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                href={`tel:${job.hirerPhone}`}
                className="flex items-center justify-center gap-3 w-full min-h-[56px] py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg shadow-md border-2 border-emerald-800 transition-colors text-center"
              >
                <Phone className="w-6 h-6 text-yellow-300" />
                <span>{t('laborer.call_farmer', 'CALL FARMER 📞')} ({job.hirerPhone})</span>
              </motion.a>
            )}
          </div>
        ) : isFull ? (
          <div className="bg-gray-100 text-gray-600 p-3.5 rounded-2xl text-center font-black text-base border border-gray-300">
            Work requirement already filled by other workers
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div className="sm:col-span-3">
              <BigActionButton
                onClick={() => onAccept(job.id)}
                variant="green"
                size="lg"
                icon={Check}
              >
                {t('laborer.accept_job', 'ACCEPT WORK 🟢')}
              </BigActionButton>
            </div>

            <div className="sm:col-span-1">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.92 }}
                type="button"
                onClick={() => onReject(job.id)}
                className="w-full min-h-[56px] sm:min-h-[64px] rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-800 border-2 border-rose-300 font-black text-base flex items-center justify-center gap-1.5 transition-colors"
                aria-label="Skip Job"
              >
                <X className="w-5 h-5 text-rose-600" />
                <span>Skip</span>
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
