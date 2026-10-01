import { useTranslation } from 'react-i18next';
import { Send, MapPin, Calendar, IndianRupee, Users } from 'lucide-react';
import BigActionButton from '../../common/BigActionButton';

export default function StepJobConfirm({
  jobData,
  onConfirm,
  loading = false
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      {/* Visual Summary Card */}
      <div className="bg-emerald-50 border-4 border-emerald-400 rounded-3xl p-5 shadow-md flex flex-col gap-4">
        <div className="flex items-center justify-between border-b-2 border-emerald-200 pb-3">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🌾</span>
            <div>
              <span className="text-xs font-bold text-gray-500 uppercase">Work Type</span>
              <h3 className="text-2xl font-black text-emerald-950">{jobData.workType}</h3>
            </div>
          </div>
          <span className="bg-emerald-600 text-white font-black px-4 py-2 rounded-2xl text-lg shadow">
            {jobData.dateOption}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-3 rounded-2xl border-2 border-emerald-200 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600 shrink-0" />
            <div>
              <span className="text-xs text-gray-500 font-bold block">Workers</span>
              <span className="text-xl font-black text-gray-900">{jobData.workerCount} ({jobData.genderPreference})</span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-2xl border-2 border-emerald-200 flex items-center gap-2">
            <IndianRupee className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <span className="text-xs text-gray-500 font-bold block">Daily Wage</span>
              <span className="text-xl font-black text-emerald-700">₹{jobData.dailyWage} / day</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-3 rounded-2xl border-2 border-emerald-200 flex items-center gap-3">
          <MapPin className="w-6 h-6 text-rose-500 shrink-0" />
          <div className="overflow-hidden">
            <span className="text-xs text-gray-500 font-bold block">Farm Location</span>
            <span className="text-base font-black text-gray-900 truncate block">{jobData.location || 'Local Farm'}</span>
          </div>
        </div>
      </div>

      {/* Broadcast Action */}
      <BigActionButton
        onClick={onConfirm}
        disabled={loading}
        variant="green"
        size="xl"
        icon={Send}
      >
        {loading ? 'BROADCASTING...' : t('farmer.broadcast_btn', '📢 BROADCAST WORK NOW')}
      </BigActionButton>
    </div>
  );
}
