import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { socket, joinUserRoom } from '../../socket';
import { LogOut } from 'lucide-react';
import LaborerList from './LaborerList';
import LaborerProfile from './LaborerProfile';
import BookingForm from './BookingForm';
import WorkAlertForm from './WorkAlertForm';
import NotificationsPage from './NotificationsPage';
import BookingsPage from './BookingsPage';
import HireBottomNavigation from './HireBottomNavigation';
import UserProfile from '../UserProfile';
import { useTranslation } from 'react-i18next';

export default function HireLaborersPage({ user, onLogout }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('laborers'); // 'laborers' | 'notifications' | 'bookings' | 'post_job'
  const [subView, setSubView] = useState('list'); // 'list' | 'profile' | 'booking_form'

  const [laborers, setLaborers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedLaborer, setSelectedLaborer] = useState(null);

  useEffect(() => {
    if (user?.uid) {
      joinUserRoom(user.uid);
      fetchLaborers();
      fetchNotifications();
      fetchBookings();
      fetchJobs();
    }

    const handleNotificationCreated = () => {
      fetchNotifications();
    };

    const handleBookingAccepted = () => {
      fetchBookings();
      fetchNotifications();
    };

    const handleBookingRejected = () => {
      fetchBookings();
      fetchNotifications();
    };

    socket.on('notification-created', handleNotificationCreated);
    socket.on('booking-accepted', handleBookingAccepted);
    socket.on('booking-rejected', handleBookingRejected);

    return () => {
      socket.off('notification-created', handleNotificationCreated);
      socket.off('booking-accepted', handleBookingAccepted);
      socket.off('booking-rejected', handleBookingRejected);
    };
  }, [user]);

  const fetchLaborers = async () => {
    try {
      const data = await api.getLaborers();
      setLaborers(data || []);
    } catch (err) {
      console.error('Error fetching laborers:', err);
    }
  };

  const fetchNotifications = async () => {
    try {
      const data = await api.getNotifications(user?.uid);
      setNotifications(data || []);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  };

  const fetchBookings = async () => {
    try {
      const data = await api.getMyBookings(user?.uid);
      setBookings(data || []);
    } catch (err) {
      console.error('Error fetching bookings:', err);
    }
  };

  const fetchJobs = async () => {
    try {
      const data = await api.getHirerJobs(user?.uid);
      setJobs(data || []);
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSubView('list');
    if (tab === 'notifications') fetchNotifications();
    if (tab === 'bookings') fetchBookings();
    if (tab === 'laborers') fetchLaborers();
  };

  const handleViewDetails = (laborer) => {
    setSelectedLaborer(laborer);
    setSubView('profile');
  };

  const handleOpenBooking = (laborer) => {
    setSelectedLaborer(laborer);
    setSubView('booking_form');
  };

  const handleAddBooking = async (bookingData) => {
    try {
      await api.sendBookingRequest(user.uid, {
        laborerId: bookingData.laborerId,
        workTitle: bookingData.workType || bookingData.title,
        wage: bookingData.wage
      });
      fetchBookings();
      fetchNotifications();
      handleTabChange('bookings');
    } catch (err) {
      console.error('Error sending booking request:', err);
      alert('Failed to send booking request');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead(user?.uid);
      setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    } catch (err) {
      console.error(err);
    }
  };

  const unreadNotificationsCount = notifications.filter((n) => n.unread).length;

  return (
    <div className="flex flex-col flex-1 w-full max-w-md mx-auto min-h-screen bg-gray-50 pb-20">
      {/* Top Header */}
      <div className="flex items-center justify-between py-3 mb-2">
        <div className="flex items-center space-x-2">
          <h1 className="text-xl font-bold text-gray-900">{t('owner_dash.hire_laborers')}</h1>
          <span className="bg-green-100 text-green-800 text-[11px] font-bold px-2.5 py-1 rounded-full border border-green-200">
            {t('owner_dash.farm_owner')}
          </span>
        </div>
        {onLogout && (
          <button
            onClick={onLogout}
            className="p-2 text-gray-400 hover:text-red-600 transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1">
        {activeTab === 'laborers' && (
          <>
            {subView === 'list' && (
              <LaborerList laborers={laborers} onViewDetails={handleViewDetails} onSearchOrFilter={fetchLaborers} onBookLaborer={handleOpenBooking} />
            )}

            {subView === 'profile' && selectedLaborer && (
              <LaborerProfile
                laborer={selectedLaborer}
                onBack={() => setSubView('list')}
                onBookLaborer={handleOpenBooking}
              />
            )}

            {subView === 'booking_form' && selectedLaborer && (
              <BookingForm
                laborer={selectedLaborer}
                onBack={() => setSubView('profile')}
                onSubmitBooking={handleAddBooking}
              />
            )}
          </>
        )}

        {activeTab === 'notifications' && (
          <NotificationsPage
            notifications={notifications}
            onMarkAllRead={handleMarkAllRead}
          />
        )}

        {activeTab === 'bookings' && (
          <BookingsPage bookings={bookings} jobs={jobs} />
        )}

        {activeTab === 'post_job' && (
          <WorkAlertForm onJobCreated={() => handleTabChange('laborers')} />
        )}

        {activeTab === 'account' && (
          <UserProfile onLogout={onLogout} />
        )}
      </div>

      {/* Fixed Bottom Navigation */}
      <HireBottomNavigation
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        unreadCount={unreadNotificationsCount}
      />
    </div>
  );
}
