import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../App';
import { Phone, ArrowRight, UserPlus, LogIn, User } from 'lucide-react';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notRegistered, setNotRegistered] = useState(false);
  const { setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setNotRegistered(false);

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404 || data.notRegistered) {
          setError('This phone number is not registered in the database.');
          setNotRegistered(true);
        } else {
          setError(data.error || 'Login failed');
        }
      } else {
        setUser(data);
        if (data.role === 'laborer') navigate('/laborer');
        else navigate('/owner');
      }
    } catch (err) {
      setError('Cannot connect to server. Is the backend running?');
    }
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }
    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, name: name.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Registration failed');
      } else {
        setUser(data);
        navigate('/role');
      }
    } catch (err) {
      setError('Cannot connect to server. Is the backend running?');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 w-full space-y-6 animate-in fade-in zoom-in duration-500">
      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl w-full text-center space-y-6 border border-gray-100">

        {/* Top Icon */}
        <div className="mx-auto bg-green-50 p-4 rounded-2xl inline-block border border-green-100">
          {mode === 'login' ? (
            <Phone className="w-9 h-9 text-green-600" />
          ) : (
            <UserPlus className="w-9 h-9 text-green-600" />
          )}
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-800">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-gray-500 text-xs mt-1">
            {mode === 'login'
              ? 'Enter your registered phone number to log in'
              : 'Register your number to start using Farm Connect'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
              setNotRegistered(false);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
              mode === 'login'
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Log In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
              setNotRegistered(false);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
              mode === 'register'
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register (New)</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
          
          {/* Name input (only for Register) */}
          {mode === 'register' && (
            <div className="relative text-left">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Your Full Name</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <User className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none transition-all text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          {/* Phone input */}
          <div className="relative text-left">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Mobile Number</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-gray-500 font-semibold text-sm">
                +91
              </span>
              <input
                type="tel"
                placeholder="9876543210"
                maxLength={10}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none transition-all text-base tracking-wider"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, ''));
                  setError('');
                  setNotRegistered(false);
                }}
                required
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-xs text-left space-y-2">
              <p className="font-medium">{error}</p>
              {notRegistered && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError('');
                    setNotRegistered(false);
                  }}
                  className="w-full text-center bg-green-600 text-white font-semibold py-1.5 px-3 rounded-lg text-xs hover:bg-green-700 transition-all"
                >
                  Create an account with +91 {phone}
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:bg-gray-300 text-sm"
          >
            <span>{loading ? 'Verifying...' : mode === 'login' ? 'Log In' : 'Create Account'}</span>
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
