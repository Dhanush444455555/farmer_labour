import { motion } from 'framer-motion';

export function JobCardSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0.6 }}
      animate={{ opacity: [0.6, 1, 0.6] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
      className="bg-white rounded-3xl p-5 border-4 border-gray-100 shadow-md flex flex-col gap-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gray-200" />
          <div className="space-y-2">
            <div className="w-32 h-5 bg-gray-200 rounded-lg" />
            <div className="w-20 h-3.5 bg-gray-100 rounded-md" />
          </div>
        </div>
        <div className="w-24 h-8 bg-gray-200 rounded-2xl" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="h-14 bg-gray-100 rounded-2xl" />
        <div className="h-14 bg-gray-100 rounded-2xl" />
      </div>

      <div className="h-10 bg-gray-100 rounded-2xl" />
      <div className="h-14 bg-gray-200 rounded-2xl" />
    </motion.div>
  );
}

export function WorkerCardSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0.6 }}
      animate={{ opacity: [0.6, 1, 0.6] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
      className="bg-white rounded-3xl p-5 border-3 border-gray-100 shadow-md flex flex-col gap-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gray-200" />
          <div className="space-y-2">
            <div className="w-28 h-5 bg-gray-200 rounded-lg" />
            <div className="w-36 h-3.5 bg-gray-100 rounded-md" />
          </div>
        </div>
        <div className="w-20 h-8 bg-gray-200 rounded-2xl" />
      </div>
      <div className="h-14 bg-gray-200 rounded-2xl" />
    </motion.div>
  );
}
