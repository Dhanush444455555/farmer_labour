import { useContext, useState } from 'react';
import { AuthContext } from '../App';
import { User, Phone, MapPin, Briefcase, Settings, LogOut, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function UserProfile({ onLogout }) {
  const { t } = useTranslation();
  const { user } = useContext(AuthContext);

  if (!user) return null;

  return (
    <div className="flex flex-col flex-1 w-full max-w-md mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-4">
        <div className="bg-green-600 h-24"></div>
        <div className="px-6 pb-6 relative">
          <div className="w-20 h-20 bg-white rounded-full p-1 absolute -top-10 left-6">
            <div className="w-full h-full bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-2xl">
              {(user.name || '?')[0].toUpperCase()}
            </div>
          </div>
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900">{user.name || 'User'}</h2>
            <p className="text-gray-500 capitalize">{user.role === 'farmowner' ? 'Farm Owner' : user.role}</p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3 text-gray-700">
              <Phone className="w-5 h-5 text-gray-400" />
              <span>{user.phone_number}</span>
            </div>
            {user.location && (
              <div className="flex items-center gap-3 text-gray-700">
                <MapPin className="w-5 h-5 text-gray-400" />
                <span>{user.location}</span>
              </div>
            )}
            {user.gender && user.gender !== 'Unspecified' && (
              <div className="flex items-center gap-3 text-gray-700">
                <User className="w-5 h-5 text-gray-400" />
                <span>{user.gender}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2">
        <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl transition-colors text-left" onClick={() => alert('Account status is ACTIVE.')}>
          <div className="flex items-center gap-3 text-gray-800 font-medium">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span>Account Status</span>
          </div>
          <span className="text-sm font-bold text-green-600 bg-green-100 px-2.5 py-1 rounded-full">ACTIVE</span>
        </button>
        <button className="w-full flex items-center justify-between p-4 hover:bg-red-50 rounded-xl transition-colors text-left mt-2" onClick={onLogout}>
          <div className="flex items-center gap-3 text-red-600 font-medium">
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </div>
        </button>
      </div>
    </div>
  );
}
