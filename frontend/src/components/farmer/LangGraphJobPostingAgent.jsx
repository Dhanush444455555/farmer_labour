import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Send, Sparkles, Check, RefreshCw, Volume2, Mic, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../services/api';
import VoiceInputButton from '../common/VoiceInputButton';
import BigActionButton from '../common/BigActionButton';

export default function LangGraphJobPostingAgent({ user, onComplete, onCancel }) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'en';

  const [messages, setMessages] = useState([]);
  const [currentInput, setCurrentInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentStage, setAgentStage] = useState('collect_info'); // 'collect_info' | 'confirm' | 'completed'
  const [jobState, setJobState] = useState({});
  const [confirmationSummary, setConfirmationSummary] = useState(null);
  const messagesEndRef = useRef(null);

  // Initialize first turn with the LangGraph Agent
  useEffect(() => {
    initAgent();
  }, [currentLang]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const initAgent = async () => {
    setLoading(true);
    try {
      const res = await api.runJobPostingAgent(user.uid, {
        message: '',
        language: currentLang,
        reset: true
      });

      setAgentStage(res.stage);
      setJobState(res.jobState || {});
      setConfirmationSummary(res.confirmationSummary);

      setMessages([
        {
          id: 'welcome',
          sender: 'agent',
          text: res.botMessage || 'Hello! Tell me what farm work you need done (e.g., "Need 3 workers tomorrow for harvesting 500 rupees").'
        }
      ]);
    } catch (err) {
      console.error('Agent Init Error:', err);
      setMessages([
        {
          id: 'err',
          sender: 'agent',
          text: 'What farm work is needed? (e.g. Harvesting, Weeding, Plowing)'
        }
      ]);
    }
    setLoading(false);
  };

  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || currentInput).trim();
    if (!text && agentStage !== 'confirm') return;

    // Add user message
    const userMsgObj = { id: Date.now(), sender: 'user', text };
    setMessages((prev) => [...prev, userMsgObj]);
    setCurrentInput('');
    setLoading(true);

    try {
      const res = await api.runJobPostingAgent(user.uid, {
        message: text,
        language: currentLang,
        confirm: agentStage === 'confirm' && (text.toLowerCase() === 'yes' || text.toLowerCase() === 'confirm')
      });

      setAgentStage(res.stage);
      if (res.jobState) setJobState(res.jobState);
      if (res.confirmationSummary) setConfirmationSummary(res.confirmationSummary);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'agent',
          text: res.botMessage
        }
      ]);

      if (res.isSubmitted) {
        setTimeout(() => {
          onComplete();
        }, 1800);
      }
    } catch (err) {
      console.error('Agent turn failed:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'agent',
          text: 'Could not connect. Please try speaking again.'
        }
      ]);
    }
    setLoading(false);
  };

  const handleConfirmSubmit = async () => {
    setLoading(true);
    try {
      const res = await api.runJobPostingAgent(user.uid, {
        message: 'confirm',
        language: currentLang,
        confirm: true
      });

      setAgentStage('completed');
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'agent',
          text: res.botMessage || 'Job posted successfully!'
        }
      ]);

      setTimeout(() => {
        onComplete();
      }, 1600);
    } catch (err) {
      console.error(err);
      alert('Failed to submit job: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-white rounded-3xl shadow-2xl border-3 border-emerald-200 overflow-hidden flex flex-col min-h-[600px] h-[80vh]">
      {/* Agent Top Header */}
      <div className="bg-emerald-800 text-white p-4 flex items-center justify-between shadow-md">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={onCancel}
          type="button"
          className="flex items-center justify-center min-w-[56px] min-h-[56px] rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500 text-xl font-bold transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-7 h-7" strokeWidth={3} />
        </motion.button>

        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 bg-yellow-400 text-emerald-950 px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase shadow-sm">
            <Sparkles className="w-4 h-4 text-emerald-950 animate-spin-slow" />
            LangGraph Agent
          </span>
          <h2 className="text-xl font-black text-white leading-tight mt-0.5">
            Voice Job Assistant
          </h2>
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={initAgent}
          type="button"
          className="flex items-center justify-center min-w-[56px] min-h-[56px] rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500 transition-colors"
          aria-label="Reset Agent"
        >
          <RefreshCw className="w-6 h-6" />
        </motion.button>
      </div>

      {/* Partial State Badges */}
      <div className="bg-emerald-50 px-3 py-2 border-b border-emerald-200 flex items-center gap-2 overflow-x-auto no-scrollbar text-xs font-black">
        <span className="text-gray-500 shrink-0">Extracted:</span>
        {jobState.workType && (
          <span className="bg-emerald-200 text-emerald-950 px-2.5 py-1 rounded-xl shrink-0">
            🌾 {jobState.workType}
          </span>
        )}
        {jobState.laborersRequired && (
          <span className="bg-blue-200 text-blue-950 px-2.5 py-1 rounded-xl shrink-0">
            👥 {jobState.laborersRequired} Workers
          </span>
        )}
        {jobState.wage && (
          <span className="bg-yellow-200 text-yellow-950 px-2.5 py-1 rounded-xl shrink-0">
            ₹{jobState.wage}/day
          </span>
        )}
        {jobState.location && (
          <span className="bg-rose-100 text-rose-950 px-2.5 py-1 rounded-xl shrink-0 truncate max-w-[120px]">
            📍 {jobState.location}
          </span>
        )}
      </div>

      {/* Chat Transcript Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50/50">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18 }}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] p-4 rounded-3xl text-base font-bold shadow-md whitespace-pre-line leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-emerald-600 text-white rounded-br-none'
                  : 'bg-white text-gray-900 border-2 border-emerald-200 rounded-bl-none'
              }`}
            >
              {msg.sender === 'agent' && (
                <span className="text-xs uppercase font-black tracking-wider text-emerald-700 block mb-1">
                  🤖 Assistant
                </span>
              )}
              {msg.text}
            </div>
          </motion.div>
        ))}

        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-emerald-800 font-black text-sm bg-emerald-100/70 p-3 rounded-2xl w-fit"
          >
            <RefreshCw className="w-5 h-5 animate-spin text-emerald-700" />
            <span>Agent thinking & extracting details...</span>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Confirmation Card if in 'confirm' stage */}
      {agentStage === 'confirm' && confirmationSummary && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="p-4 bg-yellow-50 border-t-2 border-yellow-300 flex flex-col gap-3"
        >
          <BigActionButton
            onClick={handleConfirmSubmit}
            disabled={loading}
            variant="green"
            size="xl"
            icon={Check}
          >
            {loading ? 'BROADCASTING...' : 'CONFIRM & BROADCAST 📢'}
          </BigActionButton>
        </motion.div>
      )}

      {/* Input Controls: Voice First + Text Fallback */}
      <div className="p-3 bg-white border-t-2 border-emerald-100 flex flex-col gap-2">
        <VoiceInputButton
          onSpeechResult={(spoken) => handleSendMessage(spoken)}
          label="Tap & Speak Answer"
          hint='Speak clearly in your selected language'
        />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            placeholder="Or type here..."
            className="flex-1 bg-gray-100 border border-gray-300 rounded-2xl px-4 py-3 min-h-[50px] font-bold text-gray-900 outline-none focus:border-emerald-500"
          />

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            type="submit"
            disabled={!currentInput.trim() || loading}
            className="min-w-[50px] min-h-[50px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center disabled:opacity-40 transition-colors shadow-md"
            aria-label="Send Message"
          >
            <Send className="w-5 h-5" />
          </motion.button>
        </form>
      </div>
    </div>
  );
}
