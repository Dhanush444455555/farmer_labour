import { Mic, MicOff, Volume2 } from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';

export default function VoiceInputButton({
  onSpeechResult,
  label = 'Tap to Speak',
  hint = 'e.g. "Need 3 workers tomorrow 500 rupees"',
  size = 'lg',
  className = ''
}) {
  const {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening
  } = useSpeechRecognition({
    onResult: (finalText) => {
      if (onSpeechResult) onSpeechResult(finalText);
    }
  });

  if (!isSupported) {
    return (
      <div className="text-xs font-semibold text-gray-400 text-center py-1">
        (Voice input available on Chrome & Edge browsers)
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-2 w-full ${className}`}>
      <button
        type="button"
        onClick={isListening ? stopListening : startListening}
        className={`
          flex items-center justify-center gap-3 w-full min-h-[56px] py-3.5 px-6 rounded-2xl font-black text-lg shadow-lg transition-all active:scale-95 border-2 select-none
          ${
            isListening
              ? 'bg-rose-600 text-white border-rose-800 ring-4 ring-rose-300 animate-pulse'
              : 'bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 text-amber-950 border-amber-600 shadow-amber-200'
          }
        `}
      >
        {isListening ? (
          <>
            <MicOff className="w-7 h-7 text-white animate-bounce" />
            <span>Listening... Tap to Stop 🛑</span>
          </>
        ) : (
          <>
            <Mic className="w-7 h-7 text-amber-950 animate-pulse" />
            <span>🎙️ {label}</span>
          </>
        )}
      </button>

      {/* Spoken Text Feedback */}
      {isListening && transcript && (
        <div className="w-full bg-yellow-50 border-2 border-yellow-400 rounded-2xl p-3 text-center animate-fade-in">
          <span className="text-xs font-bold text-yellow-800 uppercase block mb-1">
            Hearing:
          </span>
          <p className="text-base font-black text-emerald-950 italic">
            "{transcript}"
          </p>
        </div>
      )}

      {!isListening && hint && (
        <span className="text-xs font-bold text-gray-500 text-center">
          {hint}
        </span>
      )}

      {error && (
        <span className="text-xs font-bold text-rose-600 text-center">
          Microphone permission required.
        </span>
      )}
    </div>
  );
}
