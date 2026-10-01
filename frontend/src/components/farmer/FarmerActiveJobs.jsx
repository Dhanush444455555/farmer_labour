import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw, Users, IndianRupee } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../../services/api';
import VisualStatusBadge from '../common/VisualStatusBadge';
import { JobCardSkeleton } from '../common/SkeletonCard';

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

const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease: 'easeOut' } }
};

export default function FarmerActiveJobs({ user, onBack }) {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyJobs();
  }, []);

  const fetchMyJobs = async () => {
    setLoading(true);
    try {
      const data = await api.getHirerJobs(user.uid);
      setJobs(data || []);
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
    setLoading(false);
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-4 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-emerald-800 text-white p-4 rounded-3xl shadow-lg">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={onBack}
          type="button"
          className="flex items-center justify-center min-w-[56px] min-h-[56px] rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500 text-xl font-bold transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-7 h-7" strokeWidth={3} />
        </motion.button>

        <h2 className="text-xl sm:text-2xl font-black text-yellow-300">
          {t('farmer.my_jobs_card', '📋 My Jobs')}
        </h2>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={fetchMyJobs}
          type="button"
          className="flex items-center justify-center min-w-[56px] min-h-[56px] rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-6 h-6 ${loading ? 'animate-spin' : ''}`} />
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="jobs-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-4"
          >
            <JobCardSkeleton />
            <JobCardSkeleton />
          </motion.div>
        ) : jobs.length === 0 ? (
          <motion.div
            key="jobs-empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="bg-white rounded-3xl p-8 text-center border-2 border-dashed border-gray-300 shadow-sm"
          >
            <span className="text-5xl mb-3 block">📢</span>
            <h3 className="text-xl font-black text-gray-800 mb-1">
              No active jobs posted yet
            </h3>
            <p className="text-gray-500 font-semibold">
              Post your first job to broadcast to local workers.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="jobs-list"
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-4"
          >
            {jobs.map((job) => {
              const isFull = job.status === 'FULL' || (job.acceptedCount >= job.workersCount);
              return (
                <motion.div
                  key={job.id}
                  variants={itemVariants}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.15 }}
                  className="bg-white rounded-3xl p-5 border-3 border-emerald-200 shadow-md flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-4xl">🌾</span>
                      <div>
                        <h4 className="text-2xl font-black text-gray-900 leading-tight">
                          {job.workType || 'Farm Work'}
                        </h4>
                        <span className="text-sm font-bold text-gray-500">
                          {job.date || 'Tomorrow'}
                        </span>
                      </div>
                    </div>

                    <VisualStatusBadge
                      status={isFull ? 'CLOSED' : 'OPEN'}
                      customText={isFull ? 'FILLED 🔴' : 'ACTIVE 🟢'}
                      size="sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-emerald-50 p-3 rounded-2xl border border-emerald-200">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-black text-gray-900">
                        {job.acceptedCount || 0} / {job.workersCount || 1} Filled
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <IndianRupee className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm font-black text-emerald-800">
                        ₹{job.wage || 0} / day
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
