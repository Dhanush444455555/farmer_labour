import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { motion } from 'framer-motion';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇮🇳', native: 'English' },
  { code: 'ta', label: 'Tamil', flag: '🇮🇳', native: 'தமிழ்' },
  { code: 'hi', label: 'Hindi', flag: '🇮🇳', native: 'हिंदी' },
  { code: 'kn', label: 'Kannada', flag: '🇮🇳', native: 'ಕನ್ನಡ' },
  { code: 'te', label: 'Telugu', flag: '🇮🇳', native: 'తెలుగు' }
];

export default function PersistentLanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'en';

  const handleLanguageChange = (langCode) => {
    i18n.changeLanguage(langCode);
    localStorage.setItem('farm_lang', langCode);
  };

  return (
    <div className="w-full bg-emerald-900 text-white px-2 py-2 shadow-md sticky top-0 z-50">
      <div className="max-w-xl mx-auto flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 text-emerald-200 text-xs font-bold shrink-0 px-2 py-1">
          <Globe className="w-5 h-5 text-yellow-300 animate-spin-slow" />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          {LANGUAGES.map((lang) => {
            const isActive = currentLang.startsWith(lang.code);
            return (
              <motion.button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.15 }}
                type="button"
                className={`flex items-center justify-center gap-1.5 px-3 min-h-[56px] rounded-2xl text-base font-extrabold shrink-0 shadow-sm ${
                  isActive
                    ? 'bg-yellow-400 text-emerald-950 ring-4 ring-yellow-200 shadow-md font-black'
                    : 'bg-emerald-800 text-emerald-100 hover:bg-emerald-700 border border-emerald-600'
                }`}
                aria-label={`Switch to ${lang.native}`}
              >
                <span className="text-xl">{lang.flag}</span>
                <span className="tracking-wide text-lg">{lang.native}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
