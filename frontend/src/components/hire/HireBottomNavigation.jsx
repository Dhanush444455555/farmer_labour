import { Users, Bell, Calendar, PlusCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function HireBottomNavigation({ activeTab, setActiveTab, unreadCount }) {
  const { t } = useTranslation();
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-30 max-w-md mx-auto">
      <div className="flex justify-around items-center h-16 px-2">
        {/* Laborers Tab */}
        <button
          onClick={() => setActiveTab('laborers')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
            activeTab === 'laborers'
              ? 'text-green-600 font-bold'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-xs">👥 {t('owner_dash.laborers')}</span>
        </button>

        {/* Notifications Tab */}
        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors relative ${
            activeTab === 'notifications'
              ? 'text-green-600 font-bold'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="relative">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-2.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-white">
                {unreadCount}
              </span>
            )}
          </div>
          <span className="text-xs">🔔 {t('owner_dash.notifications')}</span>
        </button>

        {/* Post Job Tab */}
        <button
          onClick={() => setActiveTab('post_job')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
            activeTab === 'post_job'
              ? 'text-green-600 font-bold'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <PlusCircle className="w-5 h-5" />
          <span className="text-xs">➕ {t('owner_dash.post_job')}</span>
        </button>

        {/* Bookings Tab */}
        <button
          onClick={() => setActiveTab('bookings')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
            activeTab === 'bookings'
              ? 'text-green-600 font-bold'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Calendar className="w-5 h-5" />
          <span className="text-xs">📅 {t('owner_dash.bookings')}</span>
        </button>

        {/* Account Tab */}
        <button
          onClick={() => setActiveTab('account')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
            activeTab === 'account'
              ? 'text-green-600 font-bold'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-xs">👤 Account</span>
        </button>
      </div>
    </div>
  );
}
