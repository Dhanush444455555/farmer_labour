import { useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import RoleSelection from './pages/RoleSelection';
import LaborerDashboard from './pages/LaborerDashboard';
import FarmOwnerDashboard from './pages/FarmOwnerDashboard';
import { LogOut } from 'lucide-react';

export const AuthContext = createContext(null);

function NavigationHeader() {
  const { user, setUser } = useContext(AuthContext);

  return (
    <header className="bg-green-600 text-white p-4 shadow-md flex justify-between items-center max-w-md mx-auto w-full">
      <h1 className="text-xl font-bold tracking-wide">🌾 Farm Connect</h1>
      {user && (
        <button
          onClick={() => setUser(null)}
          className="text-xs bg-green-700/80 hover:bg-green-700 text-green-100 px-2.5 py-1.5 rounded-lg flex items-center space-x-1 transition-all"
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Exit</span>
        </button>
      )}
    </header>
  );
}

function App() {
  const [user, setUserState] = useState(() => {
    try {
      const saved = localStorage.getItem('farm_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const setUser = (newUser) => {
    setUserState(newUser);
    if (newUser) {
      localStorage.setItem('farm_user', JSON.stringify(newUser));
    } else {
      localStorage.removeItem('farm_user');
    }
  };

  const getHomeRedirect = () => {
    if (!user) return '/login';
    if (user.role === 'laborer') return '/laborer';
    if (user.role === 'farmowner') return '/owner';
    return '/role';
  };

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
          <NavigationHeader />

          {/* Main Content */}
          <main className="flex-1 flex flex-col p-4 max-w-md mx-auto w-full">
            <Routes>
              <Route path="/login" element={!user ? <Login /> : <Navigate to={getHomeRedirect()} />} />
              <Route path="/role" element={user ? <RoleSelection /> : <Navigate to="/login" />} />
              <Route path="/laborer" element={user ? <LaborerDashboard /> : <Navigate to="/login" />} />
              <Route path="/owner" element={user ? <FarmOwnerDashboard /> : <Navigate to="/login" />} />
              <Route path="*" element={<Navigate to={getHomeRedirect()} />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

export default App;
