import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../App';
import { Hand, CheckCircle2, LogOut, X, PartyPopper } from 'lucide-react';

export default function LaborerDashboard() {
  const { user, setUser } = useContext(AuthContext);
  const [status, setStatus] = useState('none'); // 'none' | 'available' | 'hired'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAvailability();
    const interval = setInterval(checkAvailability, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkAvailability = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/availability', {
        headers: { 'x-user-uid': user.uid }
      });
      const data = await response.json();
      setStatus(data.status || 'none');
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleRaiseHand = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/availability', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-uid': user.uid
        }
      });
      
      if (response.ok) {
        setStatus('available');
      } else {
        alert('Failed to set availability');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    }
    setLoading(false);
  };

  const handleLowerHand = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/availability', {
        method: 'DELETE',
        headers: { 'x-user-uid': user.uid }
      });
      
      if (response.ok) {
        setStatus('none');
      } else {
        alert('Failed to cancel availability');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    }
    setLoading(false);
  };

  if (loading && status === 'none') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 w-full space-y-6 animate-in slide-in-from-bottom-4 duration-500 relative">
      <div className="flex justify-between items-center mt-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Hi, {user.name}</h2>
          <p className="text-gray-500 text-sm">Laborer Dashboard</p>
        </div>
        <button
          onClick={() => {
            const updated = { ...user, role: 'farmowner' };
            setUser(updated);
            window.location.href = '/owner';
          }}
          className="text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-xl font-medium transition-all"
        >
          Switch to Hirer 🚜
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center space-y-8">
        {status === 'none' && (
          <>
            <div className="bg-white p-8 rounded-full shadow-lg border-4 border-green-100 animate-pulse">
              <Hand className="w-20 h-20 text-green-500" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-gray-800">Free for tomorrow?</h3>
              <p className="text-gray-500 text-sm max-w-[250px]">Raise your hand to let farm owners know you are available to work tomorrow.</p>
            </div>
            <button 
              onClick={handleRaiseHand}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-2xl shadow-xl transition-all active:scale-95 text-lg"
            >
              Raise Hand for Tomorrow
            </button>
          </>
        )}

        {status === 'available' && (
          <div className="flex flex-col items-center space-y-8 animate-in zoom-in duration-500 w-full">
            <div className="flex flex-col items-center space-y-6">
              <div className="bg-green-100 p-6 rounded-full">
                <CheckCircle2 className="w-24 h-24 text-green-600" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold text-gray-800">Hand Raised!</h3>
                <p className="text-gray-500 max-w-[250px]">Farm owners can now see you in their available workers list.</p>
              </div>
            </div>
            
            <button 
              onClick={handleLowerHand}
              disabled={loading}
              className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-4 px-6 rounded-2xl shadow-sm border border-red-200 transition-all active:scale-95 text-lg flex items-center justify-center space-x-2"
            >
              <X className="w-5 h-5" />
              <span>Lower Hand (Cancel)</span>
            </button>
          </div>
        )}

        {status === 'hired' && (
          <div className="flex flex-col items-center space-y-8 animate-in zoom-in duration-500 w-full">
            <div className="flex flex-col items-center space-y-6">
              <div className="bg-amber-100 p-6 rounded-full">
                <PartyPopper className="w-24 h-24 text-amber-600" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold text-gray-800">You Are Hired!</h3>
                <p className="text-gray-500 max-w-[250px]">A farm owner has hired you for tomorrow. Get ready for work!</p>
              </div>
            </div>

            <button 
              onClick={handleRaiseHand}
              disabled={loading}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-2xl transition-all text-sm"
            >
              Reset Availability
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
