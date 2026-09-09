import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../App';
import { api } from '../../services/api';
import { Trash2 } from 'lucide-react';

export default function AdminBookings() {
  const { user } = useContext(AuthContext);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const res = await api.admin.getBookings(user.uid);
        setBookings(res);
      } catch (err) {
        console.error("Failed to fetch bookings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, [user]);

  const handleDelete = async (bookingId, workTitle) => {
    if (!window.confirm(`⚠️ DELETE booking "${workTitle}" (#${bookingId})?\n\nThis action cannot be undone!`)) return;
    
    try {
      await api.admin.deleteBooking(user.uid, bookingId);
      setBookings(bookings.filter(b => b.id !== bookingId));
    } catch (err) {
      alert('Failed to delete booking');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50">
        <h3 className="font-semibold text-gray-800 text-lg">Direct Bookings</h3>
      </div>
      
      {loading ? (
        <div className="p-10 text-center text-gray-500">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                <th className="p-4 font-medium">Work Title</th>
                <th className="p-4 font-medium">Owner ID</th>
                <th className="p-4 font-medium">Laborer ID</th>
                <th className="p-4 font-medium">Wage</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Created At</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {bookings.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="p-4 font-medium text-gray-800">{b.work_title}</td>
                  <td className="p-4 text-gray-600 font-mono text-xs">{b.owner_id}</td>
                  <td className="p-4 text-gray-600 font-mono text-xs">{b.laborer_id}</td>
                  <td className="p-4 text-green-600 font-medium">{b.wage}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      b.status === 'ACCEPTED' ? 'bg-green-100 text-green-700' :
                      b.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                      b.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="p-4 text-gray-500">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => handleDelete(b.id, b.work_title)}
                      className="text-red-400 hover:text-red-700 p-1"
                      title="Delete Booking"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">No bookings found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
