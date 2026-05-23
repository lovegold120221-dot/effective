import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, Bot, User, Wrench } from 'lucide-react';
import type { ChatMessage } from '../lib/types';

const SESSION_GAP_MS = 15 * 60 * 1000;

interface SessionGroup {
  id: string;
  label: string;
  messages: ChatMessage[];
  timestamp: number;
}

function groupIntoSessions(messages: ChatMessage[]): SessionGroup[] {
  if (!messages.length) return [];
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  const groups: SessionGroup[] = [];
  let current: ChatMessage[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].timestamp - sorted[i - 1].timestamp;
    if (gap > SESSION_GAP_MS) {
      groups.push({ id: `${sorted[i - 1].timestamp}`, label: '', messages: current, timestamp: sorted[i - 1].timestamp });
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }
  groups.push({ id: `${sorted[sorted.length - 1].timestamp}`, label: '', messages: current, timestamp: sorted[sorted.length - 1].timestamp });
  return groups.reverse();
}

function formatSessionDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSessionTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function getSessionPreview(messages: ChatMessage[]): string {
  const firstModel = messages.find(m => m.role === 'model');
  if (firstModel) {
    const text = firstModel.text.slice(0, 80);
    return text.length < firstModel.text.length ? text + '...' : text;
  }
  const firstUser = messages[0];
  if (firstUser) {
    const text = firstUser.text.slice(0, 80);
    return text.length < firstUser.text.length ? text + '...' : text;
  }
  return 'Empty session';
}

interface SessionsPanelProps {
  historyMsgs: ChatMessage[];
  onClose: () => void;
}

export default function SessionsPanel({ historyMsgs, onClose }: SessionsPanelProps) {
  const [selectedSession, setSelectedSession] = useState<SessionGroup | null>(null);
  const sessions = useMemo(() => groupIntoSessions(historyMsgs), [historyMsgs]);

  if (selectedSession) {
    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-[#080809] to-[#060608]">
        <div className="relative flex items-center justify-between px-4 py-3 border-b border-white/[0.04] shrink-0">
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedSession(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all duration-200 active:scale-90">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500/70" />
            <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500">
              {formatSessionDate(selectedSession.timestamp)}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-all duration-200 active:scale-90">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <AnimatePresence initial={false}>
            {selectedSession.messages.map((msg) => (
              <motion.div
                key={`${msg.timestamp}-${msg.role}`}
                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.7 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-2 max-w-[88%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-amber-500/15 text-amber-400' : 'bg-white/5 text-zinc-400'}`}>
                    {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-amber-500/10 text-amber-100 border border-amber-500/20 rounded-tr-sm' : 'bg-white/[0.04] text-zinc-200 border border-white/5 rounded-tl-sm'}`}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {!selectedSession.messages.length && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center h-full text-xs text-zinc-600">No messages in this session</motion.div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#080809] to-[#060608]">
      <div className="relative flex items-center justify-between px-4 py-3 border-b border-white/[0.04] shrink-0">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500/70" />
          <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500">Sessions</h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-all duration-200 active:scale-90">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {sessions.map((session, i) => (
          <motion.button
            key={session.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30, mass: 0.7, delay: i * 0.03 }}
            onClick={() => setSelectedSession(session)}
            className="w-full text-left rounded-xl border border-white/[0.04] bg-gradient-to-b from-white/[0.025] to-transparent px-4 py-3 transition-all duration-200 hover:bg-white/[0.05] hover:border-amber-500/20 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-zinc-300">{formatSessionDate(session.timestamp)}</span>
              <span className="text-[9px] text-zinc-600">{formatSessionTime(session.timestamp)}</span>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2">{getSessionPreview(session.messages)}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[8px] text-zinc-600">{session.messages.length} messages</span>
            </div>
          </motion.button>
        ))}
        {!sessions.length && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center h-full text-xs text-zinc-600">No sessions yet</motion.div>
        )}
      </div>
    </div>
  );
}
