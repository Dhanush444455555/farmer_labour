import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../App';
import { api } from '../../services/api';
import { Shield, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';

export default function AdminUsers({ role }) {
  const { user } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [user, role]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.admin.getUsers(user.uid, role);
      setUsers(res);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (userId, uid, newStatus) => {
    if (!window.confirm(`Are you sure you want to change this user's status to ${newStatus}?`)) return;
    
    try {
      await api.admin.updateUserStatus(user.uid, uid, newStatus);
      setUsers(users.map(u => u.uid === uid ? { ...u, status: newStatus } : u));
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const handleDelete = async (targetUid, name) => {
    if (!window.confirm(`⚠️ PERMANENTLY DELETE user "${name || targetUid}"?\n\nThis will remove ALL their data including jobs, bookings, and notifications.\n\nThis action cannot be undone!`)) return;
    
    try {
      await api.admin.deleteUser(user.uid, targetUid);
      setUsers(users.filter(u => u.uid !== targetUid));
    } catch (err) {
      alert(err.message || "Failed to delete user");
    }
  };

  const filteredUsers = users.filter(u => 
    (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.phone_number && u.phone_number.includes(searchTerm))
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 className="font-semibold text-gray-800 text-lg">
          {role === 'laborer' ? 'Laborers' : role === 'farmowner' ? 'Hirers' : 'All Users'}
        </h3>
        <input
          type="text"
          placeholder="Search by name or phone..."
          className="border border-gray-300 rounded-md px-4 py-2 w-64 text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      {loading ? (
        <div className="p-10 text-center text-gray-500">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Contact</th>
                {!role && <th className="p-4 font-medium">Role</th>}
                <th className="p-4 font-medium">Location</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Joined</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredUsers.map(u => (
                <tr key={u.uid} className="hover:bg-gray-50">
                  <td className="p-4 font-medium text-gray-800">{u.name || '-'}</td>
                  <td className="p-4 text-gray-600">{u.phone_number}</td>
                  {!role && <td className="p-4 text-gray-600 capitalize">{u.role || '-'}</td>}
                  <td className="p-4 text-gray-600">{u.location || '-'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      u.status === 'BLOCKED' ? 'bg-red-100 text-red-700' :
                      u.status === 'SUSPENDED' ? 'bg-orange-100 text-orange-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {u.status || 'ACTIVE'}
                    </span>
                  </td>
                  <td className="p-4 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="p-4 text-right space-x-2">
                    {u.status !== 'ACTIVE' && (
                      <button onClick={() => handleStatusChange(u.id, u.uid, 'ACTIVE')} className="text-green-600 hover:text-green-800" title="Activate">
                        <ShieldCheck size={18} />
                      </button>
                    )}
                    {u.status !== 'SUSPENDED' && (
                      <button onClick={() => handleStatusChange(u.id, u.uid, 'SUSPENDED')} className="text-orange-600 hover:text-orange-800" title="Suspend">
                        <ShieldAlert size={18} />
                      </button>
                    )}
                    {u.status !== 'BLOCKED' && (
                      <button onClick={() => handleStatusChange(u.id, u.uid, 'BLOCKED')} className="text-red-600 hover:text-red-800" title="Block">
                        <Shield size={18} />
                      </button>
                    )}
                    {u.uid !== user.uid && (
                      <button onClick={() => handleDelete(u.uid, u.name)} className="text-red-400 hover:text-red-700 ml-1" title="Delete User">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
