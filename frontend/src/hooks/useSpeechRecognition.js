import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// Map i18n codes to SpeechRecognition BCP-47 locale tags
const LANG_MAP = {
  en: 'en-IN',
  ta: 'ta-IN',
  hi: 'hi-IN',
  kn: 'kn-IN',
  te: 'te-IN'
};

export function useSpeechRecognition({ onResult } = {}) {
  const { i18n } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
        if (event.results[0].isFinal && onResult) {
          onResult(currentTranscript);
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          setError(event.error);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, [onResult]);

  const startListening = () => {
    if (!recognitionRef.current) return;
    try {
      const currentLang = i18n.language || 'en';
      recognitionRef.current.lang = LANG_MAP[currentLang.slice(0, 2)] || 'en-IN';
      setTranscript('');
      setError(null);
      recognitionRef.current.start();
    } catch (err) {
      console.warn('Recognition start failed:', err);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch (err) {}
    }
  };

  return {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening
  };
}
