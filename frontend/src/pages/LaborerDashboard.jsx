import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../App';
import { socket, joinUserRoom } from '../socket';
import { api } from '../services/api';
import { useTranslation } from 'react-i18next';
import { LogOut, RefreshCw, Search, Volume2, Sparkles, Scale, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import PersistentLanguageSwitcher from '../components/common/PersistentLanguageSwitcher';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import LaborerAvailabilityHero from '../components/laborer/LaborerAvailabilityHero';
import LaborerJobCard from '../components/laborer/LaborerJobCard';
import LaborerBookingAlert from '../components/laborer/LaborerBookingAlert';
import VisualStatusBadge from '../components/common/VisualStatusBadge';
import VoiceInputButton from '../components/common/VoiceInputButton';
import { JobCardSkeleton } from '../components/common/SkeletonCard';

const screenVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15, ease: 'easeIn' } }
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02
    }
  }
};

export default function LaborerDashboard() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'en';
  const { user, setUser } = useContext(AuthContext);

  const [availability, setAvailability] = useState('prompt'); // 'prompt' | 'AVAILABLE' | 'NOT_AVAILABLE'
  const [jobs, setJobs] = useState([]);
  const [receivedBookings, setReceivedBookings] = useState([]);
  const [acceptedJobIds, setAcceptedJobIds] = useState([]);
  const [rejectedJobIds, setRejectedJobIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // AI Agent Search Results
  const [aiVoiceSummary, setAiVoiceSummary] = useState('');
  const [ragAnswer, setRagAnswer] = useState(null);

  useEffect(() => {
    if (user?.uid) {
      joinUserRoom(user.uid);
      checkUserAvailability();
      fetchJobs();
      fetchBookings();
    }

    const handleNewWorkAlert = () => fetchJobs();
    const handleBookingRequest = () => fetchBookings();

    socket.on('new-work-alert', handleNewWorkAlert);
    socket.on('booking-request', handleBookingRequest);

    return () => {
      socket.off('new-work-alert', handleNewWorkAlert);
      socket.off('booking-request', handleBookingRequest);
    };
  }, [user]);

  const checkUserAvailability = async () => {
    try {
      const res = await api.getAvailability(user.uid);
      if (res.status === 'AVAILABLE') setAvailability('AVAILABLE');
      else if (res.status === 'NOT_AVAILABLE') setAvailability('NOT_AVAILABLE');
      else setAvailability('prompt');
    } catch (e) {
      setAvailability('prompt');
    }
  };

  const fetchJobs = async () => {
    try {
      const data = await api.getTomorrowJobs(user.uid);
      setJobs(data || []);
      const alreadyAccepted = (data || []).filter((j) => j.isAcceptedByMe).map((j) => j.id);
      setAcceptedJobIds(alreadyAccepted);
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
    setLoading(false);
  };

  const fetchBookings = async () => {
    try {
      const data = await api.getReceivedBookings(user.uid);
      setReceivedBookings(data || []);
    } catch (e) {}
  };

  const handleSelectAvailability = async (status) => {
    setActionLoading(true);
    setAvailability(status);
    try {
      await api.setAvailability(user.uid, 'Tomorrow', status);
      if (status === 'AVAILABLE') {
        fetchJobs();
      }
    } catch (e) {
      console.error(e);
    }
    setActionLoading(false);
  };

  const handleAcceptJob = async (jobId) => {
    if (acceptedJobIds.includes(jobId)) return;
    setAcceptedJobIds((prev) => [...prev, jobId]);

    try {
      const res = await api.acceptJob(user.uid, jobId);
      if (res.isFull) {
        setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: 'FULL' } : j)));
      }
    } catch (err) {
      console.error(err);
      alert('Could not accept job: ' + (err.message || 'Already full.'));
      setAcceptedJobIds((prev) => prev.filter((id) => id !== jobId));
    }
  };

  const handleRejectJob = async (jobId) => {
    setRejectedJobIds((prev) => [...prev, jobId]);
    try {
      await api.rejectJob(user.uid, jobId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcceptBooking = async (bookingId) => {
    try {
      await api.updateBookingStatus(user.uid, bookingId, 'ACCEPTED');
      setReceivedBookings((prev) => prev.filter((b) => b.id !== bookingId));
      fetchJobs();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectBooking = async (bookingId) => {
    try {
      await api.updateBookingStatus(user.uid, bookingId, 'REJECTED');
      setReceivedBookings((prev) => prev.filter((b) => b.id !== bookingId));
    } catch (err) {
      console.error(err);
    }
  };

  // Run LangGraph AI Search & ChromaDB RAG Agent
  const handleRunAiSearch = async (queryText) => {
    const text = (queryText || searchQuery).trim();
    if (!text) return;

    setSearchQuery(text);
    setSearchLoading(true);

    try {
      const result = await api.runJobSearchAgent(user.uid, {
        query: text,
        language: currentLang
      });

      setAiVoiceSummary(result.voiceSummary || '');
      setRagAnswer(result.ragAnswer || null);

      if (result.rankedJobs && result.rankedJobs.length > 0) {
        setJobs(result.rankedJobs);
      }

      // Voice readback if Web Speech Synthesis is available
      if (window.speechSynthesis && result.voiceSummary) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(result.voiceSummary.slice(0, 200));
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.error('AI Search Error:', err);
    }
    setSearchLoading(false);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setAiVoiceSummary('');
    setRagAnswer(null);
    fetchJobs();
  };

  const visibleJobs = jobs.filter((j) => !rejectedJobIds.includes(j.id));
  const activeBooking = receivedBookings.find((b) => b.status === 'PENDING');

  return (
    <div className="min-h-screen bg-emerald-950/5 flex flex-col pb-16">
      {/* Persistent 56px Language Bar */}
      <PersistentLanguageSwitcher />

      <div className="flex-1 max-w-xl w-full mx-auto p-4 flex flex-col gap-5">
        <EmailVerificationBanner />

        {/* User Card */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="bg-gradient-to-r from-emerald-800 to-emerald-900 rounded-3xl p-4 sm:p-5 text-white shadow-xl border-3 border-emerald-600 flex items-center justify-between"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-yellow-400 text-emerald-950 flex items-center justify-center text-3xl font-black shadow-md shrink-0">
              {user?.gender === 'Female' ? '👩' : '👨'}
            </div>
            <div>
              <span className="text-emerald-200 text-xs font-black uppercase tracking-wider block">
                {t('laborer_dash.laborer', 'Farm Laborer')}
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                {user?.name || 'Worker'}
              </h2>
              <span className="text-emerald-200 text-sm font-bold">
                {user?.phone}
              </span>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setUser(null)}
            type="button"
            className="flex flex-col items-center justify-center min-w-[56px] min-h-[56px] px-3 rounded-2xl bg-rose-700/80 hover:bg-rose-700 text-white font-black text-xs border border-rose-400 transition-colors"
            aria-label="Logout"
          >
            <LogOut className="w-6 h-6 mb-0.5" />
            <span>Exit</span>
          </motion.button>
        </motion.div>

        {/* Direct Booking Modal Alert */}
        <AnimatePresence>
          {activeBooking && (
            <LaborerBookingAlert
              booking={activeBooking}
              onAccept={handleAcceptBooking}
              onReject={handleRejectBooking}
            />
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* Screen 1: Availability Not Set -> Hero 2-Button Choice */}
          {availability === 'prompt' ? (
            <motion.div
              key="prompt"
              variants={screenVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <LaborerAvailabilityHero
                onSelectStatus={handleSelectAvailability}
                loading={actionLoading}
              />
            </motion.div>
          ) : availability === 'NOT_AVAILABLE' ? (
            /* Screen 2: Resting Mode */
            <motion.div
              key="resting"
              variants={screenVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="bg-white rounded-3xl p-6 border-4 border-rose-300 shadow-xl text-center flex flex-col gap-4"
            >
              <span className="text-6xl">😴</span>
              <VisualStatusBadge
                status="CLOSED"
                customText={t('laborer.status_rest_title', '🔴 Resting Tomorrow')}
                size="lg"
              />
              <p className="text-gray-600 font-bold text-base">
                Farm owners have been notified that you are taking tomorrow off.
              </p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => handleSelectAvailability('AVAILABLE')}
                className="w-full min-h-[64px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xl shadow-lg border-2 border-emerald-800 transition-colors flex items-center justify-center gap-2"
              >
                <span>{t('laborer.change_status', 'Change: I Want Work 🟢')}</span>
              </motion.button>
            </motion.div>
          ) : (
            /* Screen 3: Available Mode -> Live Job Feed */
            <motion.div
              key="available"
              variants={screenVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col gap-4"
            >
              {/* Status Pill Header */}
              <div className="bg-white rounded-2xl p-4 border-2 border-emerald-300 shadow-md flex items-center justify-between">
                <VisualStatusBadge
                  status="AVAILABLE"
                  customText={t('laborer.status_ready_title', '🟢 Available Tomorrow')}
                  size="md"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => handleSelectAvailability('NOT_AVAILABLE')}
                  className="text-sm font-black text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-2 rounded-xl transition-colors"
                >
                  Set Off 🔴
                </motion.button>
              </div>

              {/* Natural Language & Voice Search Agent Bar */}
              <div className="bg-white p-4 rounded-3xl border-3 border-emerald-200 shadow-md flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-xs font-black uppercase text-emerald-800 tracking-wider">
                  <Sparkles className="w-4 h-4 text-yellow-500" />
                  <span>AI Natural Language Job Search</span>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRunAiSearch();
                  }}
                  className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded-2xl px-4 py-2 min-h-[52px]"
                >
                  <Search className="w-6 h-6 text-gray-400 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder='e.g. "work near me tomorrow, good pay" or "is this wage fair?"'
                    className="w-full bg-transparent text-base font-bold text-gray-800 outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="text-gray-400 hover:text-gray-600 font-bold px-1"
                    >
                      ✕
                    </button>
                  )}
                </form>

                <VoiceInputButton
                  onSpeechResult={(spoken) => handleRunAiSearch(spoken)}
                  label="Speak Request 🎙️"
                  hint='Say: "work near me tomorrow, good pay" or "is ₹500 wage fair?"'
                />
              </div>

              {/* ChromaDB Grounded RAG Labour Rights Card */}
              <AnimatePresence>
                {ragAnswer && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-3xl p-5 border-3 border-amber-300 shadow-lg flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-amber-900 font-black text-lg">
                        <Scale className="w-6 h-6 text-amber-700" />
                        <span>ChromaDB Labour Rights Check</span>
                      </div>
                      <span className="bg-amber-200 text-amber-950 font-black text-xs px-2.5 py-1 rounded-full">
                        Grounded RAG
                      </span>
                    </div>

                    <p className="text-base font-bold text-gray-900 whitespace-pre-line leading-relaxed">
                      {ragAnswer.explanation}
                    </p>

                    {ragAnswer.groundedSources && (
                      <div className="pt-1 border-t border-amber-200 text-xs font-bold text-amber-800 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>Sources: {ragAnswer.groundedSources.join(' • ')}</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Top 3 Audio Voice Summary Banner */}
              <AnimatePresence>
                {aiVoiceSummary && !ragAnswer && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="bg-emerald-800 text-white rounded-3xl p-4 shadow-lg flex items-start gap-3 border-2 border-emerald-600"
                  >
                    <Volume2 className="w-6 h-6 text-yellow-300 shrink-0 mt-0.5 animate-pulse" />
                    <div className="flex-1">
                      <span className="text-xs font-black uppercase text-yellow-300 block mb-1">
                        Ranked Job Summary
                      </span>
                      <p className="text-base font-bold whitespace-pre-line leading-relaxed">
                        {aiVoiceSummary}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-between pt-1">
                <h3 className="text-xl sm:text-2xl font-black text-emerald-950 flex items-center gap-2">
                  <span>🌾</span>
                  <span>{t('laborer.find_work_title', 'Available Jobs')}</span>
                </h3>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={fetchJobs}
                  className="p-2.5 rounded-xl bg-white border border-gray-300 shadow-sm text-gray-700 hover:bg-gray-50"
                  aria-label="Refresh Jobs"
                >
                  <RefreshCw className={`w-5 h-5 ${loading || searchLoading ? 'animate-spin' : ''}`} />
                </motion.button>
              </div>

              {/* Animated Skeleton-to-Content Transition */}
              <AnimatePresence mode="wait">
                {loading || searchLoading ? (
                  <motion.div
                    key="skeletons"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col gap-4"
                  >
                    <JobCardSkeleton />
                    <JobCardSkeleton />
                  </motion.div>
                ) : visibleJobs.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="bg-white rounded-3xl p-8 text-center border-2 border-dashed border-gray-300 shadow-sm flex flex-col items-center gap-2"
                  >
                    <span className="text-6xl mb-2">🔔</span>
                    <h4 className="text-xl font-black text-gray-800">
                      {t('laborer.no_jobs', 'No jobs matching right now')}
                    </h4>
                    <p className="text-sm font-bold text-gray-500">
                      You will get an instant sound and alert when a farm owner posts work!
                    </p>
                    {searchQuery && (
                      <button
                        onClick={handleClearSearch}
                        className="mt-2 text-emerald-700 font-bold underline"
                      >
                        Clear Search Filter
                      </button>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="jobs-list"
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="flex flex-col gap-4"
                  >
                    {visibleJobs.map((job) => (
                      <LaborerJobCard
                        key={job.id}
                        job={job}
                        onAccept={handleAcceptJob}
                        onReject={handleRejectJob}
                        isAccepted={acceptedJobIds.includes(job.id)}
                        isFull={job.status === 'FULL'}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
