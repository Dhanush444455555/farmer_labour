import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../App';
import { api } from '../../services/api';
import { Edit2, X, Check, Trash2 } from 'lucide-react';

export default function AdminJobs() {
  const { user } = useContext(AuthContext);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingJob, setEditingJob] = useState(null);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await api.admin.getJobs(user.uid);
        setJobs(res);
      } catch (err) {
        console.error("Failed to fetch jobs:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchJobs();
  }, [user]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.admin.updateJob(user.uid, editingJob.id, editingJob);
      setJobs(jobs.map(j => j.id === editingJob.id ? editingJob : j));
      setEditingJob(null);
    } catch (err) {
      alert('Failed to update job');
    }
  };

  const handleDelete = async (jobId, title) => {
    if (!window.confirm(`⚠️ DELETE job "${title}" (#${jobId})?\n\nThis will also remove all acceptances and rejections for this job.\n\nThis action cannot be undone!`)) return;
    
    try {
      await api.admin.deleteJob(user.uid, jobId);
      setJobs(jobs.filter(j => j.id !== jobId));
    } catch (err) {
      alert('Failed to delete job');
    }
  };

  const filteredJobs = jobs.filter(j => 
    (j.title && j.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (j.hirer_name && j.hirer_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 className="font-semibold text-gray-800 text-lg">Job Posts</h3>
        <input
          type="text"
          placeholder="Search jobs..."
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
                <th className="p-4 font-medium">Title</th>
                <th className="p-4 font-medium">Hirer</th>
                <th className="p-4 font-medium">Location</th>
                <th className="p-4 font-medium">Date/Time</th>
                <th className="p-4 font-medium">Wage</th>
                <th className="p-4 font-medium">Workers</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredJobs.map(j => (
                <tr key={j.id} className="hover:bg-gray-50">
                  <td className="p-4 font-medium text-gray-800">{j.title}</td>
                  <td className="p-4 text-gray-600">{j.hirer_name}<br/><span className="text-xs text-gray-400">{j.hirer_phone}</span></td>
                  <td className="p-4 text-gray-600">{j.location}</td>
                  <td className="p-4 text-gray-600">{new Date(j.work_date).toLocaleDateString()}<br/><span className="text-xs text-gray-400">{j.work_time}</span></td>
                  <td className="p-4 text-gray-600 text-green-600 font-medium">{j.wage}</td>
                  <td className="p-4 text-gray-600">{j.laborers_required}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      j.status === 'OPEN' ? 'bg-green-100 text-green-700' : 
                      j.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button 
                      onClick={() => setEditingJob(j)}
                      className="text-blue-600 hover:text-blue-800 p-1"
                      title="Edit Job"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDelete(j.id, j.title)}
                      className="text-red-400 hover:text-red-700 p-1"
                      title="Delete Job"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredJobs.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">No jobs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Job Modal */}
      {editingJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Edit Job #{editingJob.id}</h3>
              <button onClick={() => setEditingJob(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input 
                  type="text" 
                  value={editingJob.title}
                  onChange={e => setEditingJob({...editingJob, title: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input 
                  type="text" 
                  value={editingJob.location}
                  onChange={e => setEditingJob({...editingJob, location: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Wage</label>
                  <input 
                    type="text" 
                    value={editingJob.wage}
                    onChange={e => setEditingJob({...editingJob, wage: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Workers Req.</label>
                  <input 
                    type="number" 
                    value={editingJob.laborers_required}
                    onChange={e => setEditingJob({...editingJob, laborers_required: parseInt(e.target.value) || 1})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    required
                    min="1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea 
                  value={editingJob.description || ''}
                  onChange={e => setEditingJob({...editingJob, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm h-24"
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setEditingJob(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 rounded-md text-sm font-medium text-white hover:bg-blue-700 flex items-center gap-2"
                >
                  <Check size={16} /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
