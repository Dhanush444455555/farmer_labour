import { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../App';
import { Phone, ArrowRight, Users, Tractor, User, MapPin, Navigation, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { joinUserRoom } from '../socket';
import { useTranslation } from 'react-i18next';
import PersistentLanguageSwitcher from '../components/common/PersistentLanguageSwitcher';

export default function Login() {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState('form'); // 'form' | 'location'
  const [name, setName] = useState('');

  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('Male'); // Default gender
  const [role, setRole] = useState(null); // 'laborer' | 'farmowner'
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const [tempUserData, setTempUserData] = useState(null);

  const { setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setError(t('login.error_phone'));
      return;
    }
    
    if (!name.trim()) {
      setError(t('login.error_name'));
      return;
    }
    
    
    if (!role) {
      setError(t('login.error_role'));
      return;
    }

    setLoading(true);
    try {
      let userData = await api.login(cleanPhone);
      
      if (!userData.role || !userData.gender || userData.gender === 'Unspecified') {
        userData = await api.updateProfile(userData.uid, { name: name.trim(), role, gender });
      }
      
      setTempUserData(userData);
      setStep('location');
    } catch (err) {
      setError(err.message || 'Cannot connect to server. Is the backend running?');
    }
    setLoading(false);
  };

  const finalizeLogin = (userData) => {
    setUser(userData);
    joinUserRoom(userData.uid);
    if (userData.role === 'laborer') navigate('/laborer', { replace: true });
    else navigate('/owner', { replace: true });
  };

  const handleDetectLocation = () => {
    setLocating(true);
    setLocError('');

    if (!navigator.geolocation) {
      setLocError(t('login.loc_error_unsupported'));
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          
          // Reverse geocoding via OpenStreetMap (Free, no API key required)
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
          const data = await res.json();
          
          let city = 'Unknown Location';
          if (data && data.address) {
            city = data.address.city || data.address.town || data.address.village || data.address.county || 'Unknown Location';
          }
          
          await api.updateProfile(tempUserData.uid, { location: city });
          
          // Finalize with updated location
          finalizeLogin({ ...tempUserData, location: city });
        } catch (err) {
          console.error("Location resolution error:", err);
          // Fallback to Unknown Location on network error or other failure
          const fallbackCity = 'Unknown Location';
          await api.updateProfile(tempUserData.uid, { location: fallbackCity }).catch(() => {});
          finalizeLogin({ ...tempUserData, location: fallbackCity });
        }
      },
      (error) => {
        setLocError(t('login.loc_error_denied'));
        setLocating(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Automatically trigger location detection when step changes to 'location'
  useEffect(() => {
    if (step === 'location') {
      handleDetectLocation();
    }
  }, [step]);

  return (
    <div className="flex flex-col items-center justify-start flex-1 w-full min-h-screen">
      {/* Persistent 56px Flag Language Switcher */}
      <PersistentLanguageSwitcher />

      <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md space-y-6 animate-in fade-in zoom-in duration-500 py-6 px-4">

      {step === 'form' && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg w-full text-center space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{t('login.welcome')}</h2>
            <p className="text-gray-500 text-sm mt-1">{t('login.enter_details')}</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5 text-left">
            
            {/* Name Field */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('login.full_name')}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <User className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  placeholder={t('login.name_placeholder')}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none transition-all font-medium"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>


            {/* Mobile Field */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('login.mobile_number')}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-500 font-bold">+91</span>
                <input
                  type="tel"
                  placeholder={t('login.mobile_placeholder')}
                  maxLength={10}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none transition-all font-medium tracking-wide"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
            </div>

            {/* Gender Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Gender</label>
              <select
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none transition-all font-medium text-gray-700"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Role Selection */}
            <div className="pt-2">
              <label className="block text-sm font-semibold text-gray-700 mb-3 text-center">{t('login.select_role')}</label>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  type="button"
                  onClick={() => setRole('laborer')}
                  className={`flex flex-col items-center justify-center p-4 border-2 rounded-2xl transition-all active:scale-95 ${
                    role === 'laborer' 
                      ? 'border-green-600 bg-green-50 shadow-sm' 
                      : 'border-gray-100 bg-white hover:border-green-200 hover:bg-gray-50'
                  }`}
                >
                  <div className={`p-2 rounded-full mb-2 ${role === 'laborer' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700'}`}>
                    <Users className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm">{t('login.work_laborer')}</h3>
                  <p className="text-[10px] text-gray-500 text-center mt-1">{t('login.find_work')}</p>
                </button>

                <button 
                  type="button"
                  onClick={() => setRole('farmowner')}
                  className={`flex flex-col items-center justify-center p-4 border-2 rounded-2xl transition-all active:scale-95 ${
                    role === 'farmowner' 
                      ? 'border-amber-600 bg-amber-50 shadow-sm' 
                      : 'border-gray-100 bg-white hover:border-amber-200 hover:bg-gray-50'
                  }`}
                >
                  <div className={`p-2 rounded-full mb-2 ${role === 'farmowner' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700'}`}>
                    <Tractor className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm">{t('login.hire_laborers')}</h3>
                  <p className="text-[10px] text-gray-500 text-center mt-1">{t('login.find_workers')}</p>
                </button>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm font-medium text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 mt-2 disabled:bg-gray-400"
            >
              <span>{loading ? t('login.processing') : t('login.continue')}</span>
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>
        </div>
      )}

      {step === 'location' && (
        <div className="bg-white p-8 rounded-2xl shadow-lg w-full text-center space-y-6 animate-in slide-in-from-right-8 duration-500">
          <div className="mx-auto w-20 h-20 bg-green-50 rounded-full flex items-center justify-center relative">
            {locating ? (
              <Loader2 className="w-10 h-10 text-green-600 animate-spin absolute" />
            ) : (
              <Navigation className="w-10 h-10 text-green-600" />
            )}
            {!locating && <MapPin className="w-5 h-5 text-green-800 absolute bottom-4 right-4 bg-white rounded-full p-0.5" />}
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-800">{t('login.detecting_location')}</h2>
            <p className="text-gray-500 text-sm mt-2">
              {t('login.location_desc')}
            </p>
          </div>

          {locating && (
            <p className="text-green-600 font-bold animate-pulse text-sm">
              {t('login.allow_location')}
            </p>
          )}

          {locError && (
            <div className="bg-red-50 p-4 rounded-xl border border-red-100">
              <p className="text-red-600 text-sm font-semibold">{locError}</p>
            </div>
          )}

          <div className="pt-4 space-y-3">
            <button
              onClick={handleDetectLocation}
              disabled={locating}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:bg-green-400"
            >
              <Navigation className="w-5 h-5" />
              <span>{locating ? t('login.detecting') : t('login.try_again')}</span>
            </button>
            
            {!locating && (
              <button
                onClick={() => finalizeLogin(tempUserData)}
                className="w-full bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 font-bold py-3.5 px-4 rounded-xl shadow-sm transition-all active:scale-95"
              >
                {t('login.skip_for_now')}
              </button>
            )}
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
