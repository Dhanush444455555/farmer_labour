import { useTranslation } from 'react-i18next';
import { Bell, Check, X, Phone, MapPin, IndianRupee } from 'lucide-react';
import BigActionButton from '../common/BigActionButton';

export default function LaborerBookingAlert({
  booking,
  onAccept,
  onReject
}) {
  const { t } = useTranslation();

  if (!booking) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 border-4 border-yellow-400 shadow-2xl max-w-lg w-full flex flex-col gap-5 animate-scale-up">
        {/* Header Alert */}
        <div className="flex items-center gap-3 text-yellow-900 bg-yellow-100 p-4 rounded-2xl border-2 border-yellow-300">
          <Bell className="w-8 h-8 text-yellow-600 animate-bounce shrink-0" />
          <div>
            <h3 className="text-xl font-black leading-tight">
              {t('laborer.direct_request', 'Direct Work Request!')}
            </h3>
            <p className="text-sm font-bold text-yellow-800">
              A farmer wants to book you for tomorrow
            </p>
          </div>
        </div>

        {/* Details Card */}
        <div className="bg-emerald-50 rounded-2xl p-4 border-2 border-emerald-200 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-emerald-950">
              {booking.workType || 'Farm Work'}
            </span>
            <span className="text-xl font-black text-emerald-700">
              ₹{booking.wage || 500} / day
            </span>
          </div>

          <div className="flex items-center gap-2 text-gray-700 text-sm font-bold">
            <MapPin className="w-4 h-4 text-rose-500" />
            <span>{booking.location || 'Local Farm'}</span>
          </div>
        </div>

        {/* Big Action Buttons (min 64px) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <BigActionButton
            onClick={() => onAccept(booking.id)}
            variant="green"
            size="lg"
            icon={Check}
          >
            {t('laborer.accept_request', 'Accept 🟢')}
          </BigActionButton>

          <BigActionButton
            onClick={() => onReject(booking.id)}
            variant="red"
            size="lg"
            icon={X}
          >
            {t('laborer.reject_request', 'Decline 🔴')}
          </BigActionButton>
        </div>
      </div>
    </div>
  );
}
