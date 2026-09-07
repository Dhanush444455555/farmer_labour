import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../App';
import { Phone, Users, LogOut, MapPin, CheckCircle2, UserCheck } from 'lucide-react';

export default function FarmOwnerDashboard() {
  const { user, setUser } = useContext(AuthContext);
  const [availableLaborers, setAvailableLaborers] = useState([]);
  const [hiredLaborers, setHiredLaborers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hiringId, setHiringId] = useState(null);

  useEffect(() => {
    fetchData();
    // Auto-refresh the lists every 5 seconds
    const intervalId = setInterval(fetchData, 5000);
    return () => clearInterval(intervalId);
  }, []);

  const fetchData = async () => {
    try {
      const [availableRes, hiredRes] = await Promise.all([
        fetch('http://localhost:5000/api/laborers', {
          headers: { 'x-user-uid': user.uid }
        }),
        fetch('http://localhost:5000/api/laborers/hired', {
          headers: { 'x-user-uid': user.uid }
        })
      ]);
      
      const availableData = await availableRes.json();
      const hiredData = await hiredRes.json();
      
      setAvailableLaborers(availableData || []);
      setHiredLaborers(hiredData || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
    setLoading(false);
  };

  const handleHire = async (laborerId) => {
    setHiringId(laborerId);
    try {
      const response = await fetch(`http://localhost:5000/api/laborers/${laborerId}/hire`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-uid': user.uid
        }
      });
      
      if (response.ok) {
        // Optimistically update UI
        const hiredLaborer = availableLaborers.find(l => l.id === laborerId);
        setAvailableLaborers(prev => prev.filter(l => l.id !== laborerId));
        if (hiredLaborer) {
          setHiredLaborers(prev => [...prev, hiredLaborer]);
        }
      } else {
        const errorData = await response.json();
        alert(`Failed to hire: ${errorData.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    }
    setHiringId(null);
  };

  return (
    <div className="flex flex-col flex-1 w-full space-y-8 animate-in slide-in-from-bottom-4 duration-500 relative overflow-y-auto pb-6">
      <div className="flex justify-between items-center mt-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Hi, {user.name}</h2>
          <p className="text-gray-500 text-sm">Find help for tomorrow</p>
        </div>
        <button
          onClick={() => {
            const updated = { ...user, role: 'laborer' };
            setUser(updated);
            window.location.href = '/laborer';
          }}
          className="text-xs text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-3 py-1.5 rounded-xl font-medium transition-all"
        >
          Switch to Worker 👷
        </button>
      </div>

      {loading && availableLaborers.length === 0 && hiredLaborers.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
        </div>
      ) : (
        <>
          {/* Hired Section */}
          {hiredLaborers.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center">
                <UserCheck className="w-5 h-5 mr-2 text-green-600" />
                Hired for Tomorrow
              </h3>
              <div className="space-y-3">
                {hiredLaborers.map((laborer, idx) => (
                  <div 
                    key={idx} 
                    className="bg-green-50 p-5 rounded-2xl shadow-sm border border-green-200 flex flex-col transition-all"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center text-green-800 font-bold text-lg">
                          {laborer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">{laborer.name}</h3>
                          <div className="flex items-center text-green-700 text-xs mt-1 font-medium">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            <span>Hired</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <a 
                      href={`tel:${laborer.phone_number}`}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95"
                    >
                      <Phone className="w-5 h-5" />
                      <span>Call {laborer.phone_number}</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center">
              <Users className="w-5 h-5 mr-2 text-blue-600" />
              Available Laborers
            </h3>
            
            {availableLaborers.length === 0 ? (
              <div className="bg-gray-50 p-6 rounded-2xl text-center border border-gray-200 border-dashed">
                <p className="text-gray-500 text-sm">No available laborers right now. Check back later.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {availableLaborers.map((laborer, idx) => (
                  <div 
                    key={idx} 
                    className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col transition-all hover:shadow-md"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-700 font-bold text-lg">
                          {laborer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-800">{laborer.name}</h3>
                          <div className="flex items-center text-gray-500 text-xs mt-1">
                            <MapPin className="w-3 h-3 mr-1" />
                            <span>Local Area</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => handleHire(laborer.id)}
                      disabled={hiringId === laborer.id}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:bg-gray-400"
                    >
                      {hiringId === laborer.id ? (
                        <span>Hiring...</span>
                      ) : (
                        <>
                          <span>Hire for Tomorrow</span>
                          <CheckCircle2 className="w-5 h-5 ml-2" />
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
