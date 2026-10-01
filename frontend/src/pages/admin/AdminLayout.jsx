import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../../App';
import { 
  LayoutDashboard, Users, UsersRound, Briefcase, 
  CalendarCheck, AlertTriangle, ScrollText, LogOut,
  Settings as SettingsIcon, FileText, Bell, Bot
} from 'lucide-react';
import AdminDashboard from './AdminDashboard';
import AdminUsers from './AdminUsers';
import AdminJobs from './AdminJobs';
import AdminBookings from './AdminBookings';
import AdminReports from './AdminReports';
import AdminAuditLogs from './AdminAuditLogs';
import AdminCMS from './AdminCMS';
import AdminSettings from './AdminSettings';
import AdminNotifications from './AdminNotifications';
import AdminAgentQuery from './AdminAgentQuery';

export default function AdminLayout() {
  const { setUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    setUser(null);
    navigate('/login');
  };

  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/admin/agent-query', label: 'AI Assistant', icon: <Bot size={20} />, highlight: true },
    { path: '/admin/users', label: 'All Users', icon: <Users size={20} /> },
    { path: '/admin/laborers', label: 'Laborers', icon: <UsersRound size={20} /> },
    { path: '/admin/hirers', label: 'Hirers', icon: <UsersRound size={20} /> },
    { path: '/admin/jobs', label: 'Jobs', icon: <Briefcase size={20} /> },
    { path: '/admin/bookings', label: 'Bookings', icon: <CalendarCheck size={20} /> },
    { path: '/admin/reports', label: 'Reports', icon: <AlertTriangle size={20} /> },
    { path: '/admin/audit', label: 'Audit Logs', icon: <ScrollText size={20} /> },
    { path: '/admin/cms', label: 'CMS', icon: <FileText size={20} /> },
    { path: '/admin/notifications', label: 'Notifications', icon: <Bell size={20} /> },
    { path: '/admin/settings', label: 'Settings', icon: <SettingsIcon size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-4 bg-slate-950">
          <h1 className="text-xl font-bold tracking-wider">FARM ADMIN</h1>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center px-6 py-3 hover:bg-slate-800 transition-colors ${
                    location.pathname === item.path
                      ? 'bg-slate-800 border-l-4 border-green-500 text-green-400'
                      : item.highlight
                        ? 'text-indigo-300 hover:text-indigo-200'
                        : 'text-slate-300'
                  }`}
                >
                  <span className="mr-3">{item.icon}</span>
                  {item.label}
                  {item.highlight && location.pathname !== item.path && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-indigo-600 text-white rounded-full font-bold">AI</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="p-4 bg-slate-950">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-2 text-red-400 hover:bg-slate-800 rounded transition-colors"
          >
            <LogOut size={20} className="mr-3" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm z-10 px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-800">
            {navItems.find(item => item.path === location.pathname)?.label || 'Admin Panel'}
          </h2>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <Routes>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="/agent-query" element={<AdminAgentQuery />} />
            <Route path="/users" element={<AdminUsers role="" />} />
            <Route path="/laborers" element={<AdminUsers role="laborer" />} />
            <Route path="/hirers" element={<AdminUsers role="farmowner" />} />
            <Route path="/jobs" element={<AdminJobs />} />
            <Route path="/bookings" element={<AdminBookings />} />
            <Route path="/reports" element={<AdminReports />} />
            <Route path="/audit" element={<AdminAuditLogs />} />
            <Route path="/cms" element={<AdminCMS />} />
            <Route path="/settings" element={<AdminSettings />} />
            <Route path="/notifications" element={<AdminNotifications />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
