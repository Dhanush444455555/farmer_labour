import { motion } from 'framer-motion';

export default function BigActionButton({
  children,
  onClick,
  icon: Icon,
  variant = 'green', // 'green' | 'red' | 'yellow' | 'blue' | 'gray'
  size = 'lg', // 'md' (56px) | 'lg' (64px) | 'xl' (76px)
  disabled = false,
  fullWidth = true,
  type = 'button',
  className = ''
}) {
  const variantStyles = {
    green: 'bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-700 shadow-emerald-200 active:bg-emerald-800',
    red: 'bg-rose-600 hover:bg-rose-700 text-white border-2 border-rose-700 shadow-rose-200 active:bg-rose-800',
    yellow: 'bg-amber-400 hover:bg-amber-500 text-amber-950 border-2 border-amber-600 shadow-amber-200 active:bg-amber-600',
    blue: 'bg-blue-600 hover:bg-blue-700 text-white border-2 border-blue-700 shadow-blue-200 active:bg-blue-800',
    gray: 'bg-gray-200 hover:bg-gray-300 text-gray-800 border-2 border-gray-400 shadow-gray-200 active:bg-gray-400'
  };

  const sizeStyles = {
    md: 'min-h-[56px] py-3.5 px-6 text-lg',
    lg: 'min-h-[64px] py-4 px-7 text-xl font-black',
    xl: 'min-h-[76px] py-5 px-8 text-2xl font-black'
  };

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.015, y: -1 }}
      whileTap={disabled ? {} : { scale: 0.95 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={`
        ${fullWidth ? 'w-full' : 'inline-flex'}
        ${variantStyles[variant] || variantStyles.green}
        ${sizeStyles[size] || sizeStyles.lg}
        flex items-center justify-center gap-3 rounded-2xl font-black
        shadow-lg transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        cursor-pointer select-none text-center
        ${className}
      `}
    >
      {Icon && <Icon className="w-8 h-8 shrink-0 animate-pulse-gentle" strokeWidth={2.5} />}
      <span className="tracking-wide leading-tight">{children}</span>
    </motion.button>
  );
}
