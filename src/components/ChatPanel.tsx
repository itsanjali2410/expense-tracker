import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import { ChatMessage } from '../../services/api';

interface ChatPanelProps {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  onSend: (question: string) => void;
}

const EXAMPLES = [
  'Why was Week 3 so expensive?',
  'List all cab rides this month',
  'Which subscriptions am I paying for?',
  'Where can I cut back?',
];

export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, loading, error, onSend }) => {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, loading]);

  const send = (question: string) => {
    if (!question.trim() || loading) return;
    onSend(question.trim());
    setInput('');
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col max-w-3xl mx-auto">
      <div className="p-6 border-b border-slate-100">
        <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-indigo-600" />
          Ask about your statement
        </h3>
      </div>

      <div className="p-6 space-y-4 min-h-64 max-h-[60vh] overflow-y-auto">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map(example => (
                <button
                  key={example}
                  onClick={() => send(example)}
                  className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, i) => (
          <div key={i} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
              message.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}>
              {message.text}
            </div>
          </div>
        ))}

        {loading && (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
          </p>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={e => { e.preventDefault(); send(input); }}
        className="p-4 border-t border-slate-100 flex gap-2"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="e.g. How much did I spend on food in Week 2?"
          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
