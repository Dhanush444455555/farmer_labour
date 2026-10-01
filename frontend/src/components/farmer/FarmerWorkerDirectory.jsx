import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, ArrowLeft, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../../services/api';
import VisualStatusBadge from '../common/VisualStatusBadge';
import { WorkerCardSkeleton } from '../common/SkeletonCard';

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

export default function FarmerWorkerDirectory({ onBack, user }) {
  const { t } = useTranslation();
  const [laborers, setLaborers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('available'); // 'available' | 'all'

  useEffect(() => {
    fetchLaborers();
  }, [filter]);

  const fetchLaborers = async () => {
    setLoading(true);
    try {
      const data = await api.getLaborers('', filter);
      setLaborers(data || []);
    } catch (err) {
      console.error('Error fetching laborers:', err);
    }
    setLoading(false);
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-4 pb-12">
      {/* Top Bar */}
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
          {t('farmer.call_workers_card', '👥 Available Workers')}
        </h2>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={fetchLaborers}
          type="button"
          className="flex items-center justify-center min-w-[56px] min-h-[56px] rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-6 h-6 ${loading ? 'animate-spin' : ''}`} />
        </motion.button>
      </div>

      {/* Filter Tabs (Large 56px Buttons) */}
      <div className="grid grid-cols-2 gap-3">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={() => setFilter('available')}
          className={`
            flex items-center justify-center gap-2 p-3 min-h-[56px] rounded-2xl border-3 font-black text-base sm:text-lg transition-colors shadow-sm
            ${filter === 'available'
              ? 'bg-emerald-600 text-white border-emerald-800 ring-4 ring-emerald-200 shadow-md'
              : 'bg-white text-gray-800 border-gray-300'
            }
          `}
        >
          <span className="w-3 h-3 rounded-full bg-emerald-300 inline-block" />
          <span>🟢 Available Now</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={() => setFilter('all')}
          className={`
            flex items-center justify-center gap-2 p-3 min-h-[56px] rounded-2xl border-3 font-black text-base sm:text-lg transition-colors shadow-sm
            ${filter === 'all'
              ? 'bg-emerald-600 text-white border-emerald-800 ring-4 ring-emerald-200 shadow-md'
              : 'bg-white text-gray-800 border-gray-300'
            }
          `}
        >
          <span>👥 All Workers</span>
        </motion.button>
      </div>

      {/* Workers List with Skeleton-to-Content Animation */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading-skeletons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-4"
          >
            <WorkerCardSkeleton />
            <WorkerCardSkeleton />
          </motion.div>
        ) : laborers.length === 0 ? (
          <motion.div
            key="empty-workers"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="bg-white rounded-3xl p-8 text-center border-2 border-dashed border-gray-300 shadow-sm"
          >
            <span className="text-5xl mb-3 block">🌾</span>
            <h3 className="text-xl font-black text-gray-800 mb-1">
              {t('farmer.no_workers', 'No workers found right now')}
            </h3>
            <p className="text-gray-500 font-semibold mb-6">
              Post a new job and nearby workers will receive an alert on their phones.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="workers-list"
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-4"
          >
            {laborers.map((worker) => {
              const isAvail = worker.availability === 'Available' || worker.isAvailable;
              return (
                <motion.div
                  key={worker.id || worker.uid}
                  variants={itemVariants}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.15 }}
                  className="bg-white rounded-3xl p-4 sm:p-5 border-3 border-emerald-200 shadow-md flex flex-col gap-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-3xl font-black text-emerald-800 shrink-0">
                        {worker.gender === 'Female' ? '👩' : '👨'}
                      </div>
                      <div>
                        <h4 className="text-xl font-black text-gray-900 leading-tight">
                          {worker.name || 'Farm Worker'}
                        </h4>
                        <p className="text-sm font-bold text-gray-500">
                          {worker.location || 'Local Area'} • {worker.gender || 'Laborer'}
                        </p>
                      </div>
                    </div>

                    <VisualStatusBadge
                      status={isAvail ? 'AVAILABLE' : 'CLOSED'}
                      customText={isAvail ? 'READY 🟢' : 'BUSY 🔴'}
                      size="sm"
                    />
                  </div>

                  {/* 1-Tap Direct Call Button (56px) */}
                  <motion.a
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                    href={`tel:${worker.phone}`}
                    className="flex items-center justify-center gap-3 w-full min-h-[56px] py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg sm:text-xl shadow-md border-2 border-emerald-800 transition-colors text-center select-none"
                  >
                    <Phone className="w-7 h-7 text-yellow-300 shrink-0 animate-bounce" />
                    <span>CALL {worker.phone || 'WORKER'} 📞</span>
                  </motion.a>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
