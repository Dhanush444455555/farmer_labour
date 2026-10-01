import { useState, useRef, useEffect, useContext } from 'react';
import { AuthContext } from '../../App';
import { api } from '../../services/api';
import {
  Sparkles, Send, Loader2, RotateCcw, Copy, Check,
  BarChart3, ShieldAlert, FileText, ChevronDown
} from 'lucide-react';

// ─── Category badge config ───────────────────────────────────────────────────
const CATEGORY_META = {
  analytics: {
    label: 'Analytics',
    icon: <BarChart3 size={14} />,
    cls: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  moderation: {
    label: 'Moderation',
    icon: <ShieldAlert size={14} />,
    cls: 'bg-red-100 text-red-700 border-red-200',
  },
  report: {
    label: 'Report',
    icon: <FileText size={14} />,
    cls: 'bg-violet-100 text-violet-700 border-violet-200',
  },
};

// ─── Suggested prompts ────────────────────────────────────────────────────────
const SUGGESTIONS = [
  'How many jobs were posted this week in Tamil Nadu?',
  'Flag all suspicious or unverified accounts',
  'Give me a full platform activity report',
  'How many laborers vs farmers are registered?',
  'Show top demanded work types this month',
  'Audit summary of recent admin actions',
];

// ─── Minimal markdown → HTML renderer ─────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-gray-800 mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 class="text-lg font-bold text-gray-900 mt-4 mb-2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-indigo-700 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/^\|(.+)\|$/gm, (_, row) => {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      const isSeparator = cells.every(c => /^[-:]+$/.test(c));
      if (isSeparator) return '';
      const cellTag = 'td';
      return `<tr>${cells.map(c => `<${cellTag} class="px-3 py-2 border border-gray-200 text-sm">${c}</${cellTag}>`).join('')}</tr>`;
    })
    .replace(/^[-•] (.+)$/gm, '<li class="ml-4 list-disc text-sm text-gray-700">$1</li>')
    .replace(/\n/g, '<br />');
}

// ─── Single chat bubble ───────────────────────────────────────────────────────
function Bubble({ role, text, category, entities, loading }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mr-2 mt-0.5">
          <Sparkles size={14} className="text-white" />
        </div>
      )}

      <div className={`max-w-[85%]`}>
        {!isUser && category && CATEGORY_META[category] && (
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${CATEGORY_META[category].cls}`}>
              {CATEGORY_META[category].icon}
              {CATEGORY_META[category].label}
            </span>
            {entities && Object.keys(entities).length > 0 && (
              <span className="text-xs text-gray-400">
                {Object.entries(entities).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              </span>
            )}
          </div>
        )}

        <div
          className={`rounded-2xl px-4 py-3 shadow-sm text-sm leading-relaxed
            ${isUser
              ? 'bg-indigo-600 text-white rounded-br-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
            }
          `}
        >
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              <span>Querying platform data…</span>
            </div>
          ) : isUser ? (
            <p>{text}</p>
          ) : (
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
            />
          )}
        </div>

        {!isUser && !loading && text && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 mt-1 ml-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center ml-2 mt-0.5">
          <span className="text-sm font-bold text-indigo-600">A</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminAgentQuery() {
  const { user } = useContext(AuthContext);
  const [messages, setMessages] = useState([
    {
      role: 'agent',
      text: '👋 **Hi Admin!** I can answer natural language questions about platform data.\n\nTry asking:\n- *"How many jobs were posted this week in Tamil Nadu?"*\n- *"Flag suspicious accounts"*\n- *"Give me a full activity report"*',
      category: null,
      entities: null,
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendQuery = async (queryText) => {
    const text = (queryText || input).trim();
    if (!text || loading) return;

    setInput('');
    setShowSuggestions(false);
    setMessages(prev => [...prev, { role: 'user', text, category: null, entities: null }]);
    setMessages(prev => [...prev, { role: 'agent', text: '', category: null, entities: null, loading: true }]);
    setLoading(true);

    try {
      const result = await api.admin.agentQuery(user.uid, text);
      setMessages(prev => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].loading) {
            updated[i] = {
              role: 'agent',
              text: result.answer,
              category: result.category,
              entities: result.entities,
              loading: false,
            };
            break;
          }
        }
        return updated;
      });
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].loading) {
            updated[i] = {
              role: 'agent',
              text: `⚠️ **Error:** ${err.message || 'Failed to reach the agent. Is the backend running?'}`,
              category: null,
              entities: null,
              loading: false,
            };
            break;
          }
        }
        return updated;
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuery();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: 'agent',
        text: '🔄 Chat cleared. What would you like to know?',
        category: null,
        entities: null,
      }
    ]);
    setShowSuggestions(true);
    setInput('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-base">Admin AI Assistant</h2>
            <p className="text-xs text-gray-500">Powered by LangGraph · Live platform data</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 flex-wrap justify-end">
            {Object.entries(CATEGORY_META).map(([key, meta]) => (
              <span key={key} className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.cls}`}>
                {meta.icon}{meta.label}
              </span>
            ))}
          </div>
          <button
            onClick={clearChat}
            title="Clear chat"
            className="p-2 ml-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.map((msg, i) => (
          <Bubble
            key={i}
            role={msg.role}
            text={msg.text}
            category={msg.category}
            entities={msg.entities}
            loading={msg.loading}
          />
        ))}

        {showSuggestions && (
          <div className="mt-2 mb-4">
            <button
              onClick={() => setShowSuggestions(false)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-2 transition-colors"
            >
              <ChevronDown size={12} /> Hide suggestions
            </button>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendQuery(s)}
                  disabled={loading}
                  className="text-xs px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all shadow-sm disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input Bar */}
      <div className="px-4 py-3 bg-white border-t border-gray-100">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-50 transition-all">
          <Sparkles size={16} className="text-indigo-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Ask anything, e.g. "how many jobs this week in Salem"'
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none disabled:opacity-60"
          />
          <button
            onClick={() => sendQuery()}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl transition-all shadow-sm disabled:shadow-none"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-1.5">
          Press Enter to send · answers are grounded in live DB data, not LLM opinion
        </p>
      </div>
    </div>
  );
}
