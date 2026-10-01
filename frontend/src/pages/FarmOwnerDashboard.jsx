import { useState, useContext } from 'react';
import { AuthContext } from '../App';
import { AnimatePresence, motion } from 'framer-motion';
import PersistentLanguageSwitcher from '../components/common/PersistentLanguageSwitcher';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import FarmerActionHub from '../components/farmer/FarmerActionHub';
import LangGraphJobPostingAgent from '../components/farmer/LangGraphJobPostingAgent';
import FarmerWorkerDirectory from '../components/farmer/FarmerWorkerDirectory';
import FarmerActiveJobs from '../components/farmer/FarmerActiveJobs';

const pageVariants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15, ease: 'easeIn' } }
};

export default function FarmOwnerDashboard() {
  const { user, setUser } = useContext(AuthContext);
  const [currentView, setCurrentView] = useState('hub'); // 'hub' | 'post_job' | 'directory' | 'my_jobs'
  const [successToast, setSuccessToast] = useState(false);

  const handlePostComplete = () => {
    setSuccessToast(true);
    setCurrentView('my_jobs');
    setTimeout(() => setSuccessToast(false), 5000);
  };

  return (
    <div className="min-h-screen bg-emerald-950/5 flex flex-col">
      {/* Persistent 56px Language Bar */}
      <PersistentLanguageSwitcher />

      <div className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col gap-4">
        <EmailVerificationBanner />

        <AnimatePresence>
          {successToast && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="bg-emerald-600 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between font-black text-lg border-2 border-emerald-400"
            >
              <span>🎉 Job Broadcasted to All Available Workers!</span>
              <button
                onClick={() => setSuccessToast(false)}
                className="text-white hover:text-yellow-200 text-2xl ml-2 font-black"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {currentView === 'hub' && (
            <motion.div
              key="hub"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <FarmerActionHub
                user={user}
                onStartPostJob={() => setCurrentView('post_job')}
                onOpenDirectory={() => setCurrentView('directory')}
                onOpenMyJobs={() => setCurrentView('my_jobs')}
                onLogout={() => setUser(null)}
              />
            </motion.div>
          )}

          {currentView === 'post_job' && (
            <motion.div
              key="post_job"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <LangGraphJobPostingAgent
                user={user}
                onComplete={handlePostComplete}
                onCancel={() => setCurrentView('hub')}
              />
            </motion.div>
          )}

          {currentView === 'directory' && (
            <motion.div
              key="directory"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <FarmerWorkerDirectory
                user={user}
                onBack={() => setCurrentView('hub')}
              />
            </motion.div>
          )}

          {currentView === 'my_jobs' && (
            <motion.div
              key="my_jobs"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <FarmerActiveJobs
                user={user}
                onBack={() => setCurrentView('hub')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
