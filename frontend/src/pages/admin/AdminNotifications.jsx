import { useState, useContext, useEffect, useRef } from 'react';
import { AuthContext } from '../../App';
import { api } from '../../services/api';
import { Bell, Send, Search, User, X } from 'lucide-react';

export default function AdminNotifications() {
  const { user } = useContext(AuthContext);
  const [sending, setSending] = useState(false);
  const [formData, setFormData] = useState({
    target_users: 'ALL',
    type: 'SYSTEM',
    title: '',
    message: '',
    target_uid: ''
  });

  // User search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced user search
  useEffect(() => {
    if (formData.target_users !== 'SPECIFIC') return;
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.admin.searchUsers(user.uid, searchQuery);
        setSearchResults(results);
        setShowDropdown(true);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, formData.target_users]);

  const handleSelectUser = (u) => {
    setSelectedUser(u);
    setFormData({ ...formData, target_uid: u.uid });
    setSearchQuery('');
    setShowDropdown(false);
    setSearchResults([]);
  };

  const handleClearUser = () => {
    setSelectedUser(null);
    setFormData({ ...formData, target_uid: '' });
    setSearchQuery('');
  };

  const handleTargetChange = (value) => {
    setFormData({ ...formData, target_users: value, target_uid: '' });
    setSelectedUser(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (formData.target_users === 'SPECIFIC' && !formData.target_uid) {
      alert('Please select a user to send the notification to.');
      return;
    }
    if (!confirm('Are you sure you want to push this notification?')) return;
    
    setSending(true);
    try {
      const res = await api.admin.sendNotification(user.uid, formData);
      alert(`Successfully sent notification to ${res.count} user(s)!`);
      setFormData({ ...formData, title: '', message: '' });
      if (formData.target_users === 'SPECIFIC') handleClearUser();
    } catch (err) {
      alert('Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden max-w-3xl mx-auto">
      <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
        <div className="p-2 bg-yellow-100 rounded-lg text-yellow-700">
          <Bell size={24} />
        </div>
        <div>
          <h3 className="font-semibold text-gray-800 text-lg">Push Notifications</h3>
          <p className="text-sm text-gray-500">Send real-time alerts to users' devices</p>
        </div>
      </div>
      
      <form onSubmit={handleSend} className="p-6 space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Target Audience</label>
            <select 
              value={formData.target_users}
              onChange={e => handleTargetChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Users (Laborers & Hirers)</option>
              <option value="LABORERS">All Laborers Only</option>
              <option value="HIRERS">All Hirers (Farm Owners) Only</option>
              <option value="SPECIFIC">Specific Person</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Notification Type</label>
            <select 
              value={formData.type}
              onChange={e => setFormData({...formData, type: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="SYSTEM">System Alert</option>
              <option value="UPDATE">App Update</option>
              <option value="WARNING">Important Warning</option>
              <option value="PROMO">Promotion / News</option>
            </select>
          </div>
        </div>

        {/* Specific Person Search */}
        {formData.target_users === 'SPECIFIC' && (
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Select User</label>
            {selectedUser ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    {(selectedUser.name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{selectedUser.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">{selectedUser.phone_number} • <span className="capitalize">{selectedUser.role}</span></p>
                  </div>
                </div>
                <button type="button" onClick={handleClearUser} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="relative" ref={searchRef}>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                    placeholder="Search by name or phone number..."
                    className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>

                {/* Search Results Dropdown */}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {searchResults.map((u) => (
                      <button
                        key={u.uid}
                        type="button"
                        onClick={() => handleSelectUser(u)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
                      >
                        <div className="w-8 h-8 bg-slate-600 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {(u.name || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm truncate">{u.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{u.phone_number} • <span className="capitalize">{u.role}</span></p>
                        </div>
                        <User size={14} className="text-gray-300 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                {showDropdown && searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-gray-500 text-sm">
                    No users found matching "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Notification Title</label>
          <input 
            type="text" 
            value={formData.title}
            onChange={e => setFormData({...formData, title: e.target.value})}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Server Maintenance Notice"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Message Body</label>
          <textarea 
            value={formData.message}
            onChange={e => setFormData({...formData, message: e.target.value})}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm h-32 focus:ring-2 focus:ring-blue-500"
            placeholder="Type your message here..."
            required
          />
          <p className="text-xs text-gray-400 mt-2">This message will be sent in real-time to active users and saved in their notification inbox.</p>
        </div>

        <div className="pt-6 border-t border-gray-100 flex justify-end">
          <button 
            type="submit"
            disabled={sending || !formData.title || !formData.message}
            className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-600 rounded-lg text-sm font-medium text-white flex items-center gap-2 disabled:opacity-50 shadow-sm transition-colors"
          >
            <Send size={18} /> {sending ? 'Sending...' : 'Dispatch Notification'}
          </button>
        </div>
      </form>
    </div>
  );
}
