import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Bot, Wrench } from 'lucide-react';
import type { TranscriptEntry } from '../lib/types';
import StreamingText from './StreamingText';

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
  streamingText: string | null;
  streamingRole: 'user' | 'model' | null;
  isActive: boolean;
  onClear: () => void;
  onClose: () => void;
}

export default function TranscriptPanel({
  entries,
  streamingText,
  streamingRole,
  isActive,
  onClear,
  onClose,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, streamingText]);

  return (
    <div className="flex flex-col h-full bg-[#080809]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500/70" />
          <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500">Session Transcript</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onClear}
            className="px-2 py-1 text-[9px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`flex gap-2 max-w-[88%] ${
                  entry.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div
                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                    entry.role === 'user'
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-white/5 text-zinc-400'
                  }`}
                >
                  {entry.role === 'user' ? (
                    <User className="w-3.5 h-3.5" />
                  ) : (
                    <Bot className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                      entry.role === 'user'
                        ? 'bg-amber-500/10 text-amber-100 border border-amber-500/20 rounded-tr-sm'
                        : 'bg-white/[0.04] text-zinc-200 border border-white/5 rounded-tl-sm'
                    }`}
                  >
                    {entry.text}
                    {!entry.isComplete && entry.role === 'model' && (
                      <span className="inline-block w-1.5 h-4 bg-amber-500 ml-0.5 animate-pulse rounded-full align-middle" />
                    )}
                  </div>

                  {entry.toolResults && entry.toolResults.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {entry.toolResults.map((tr) => (
                        <div
                          key={tr.id}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/5 border border-amber-500/10 text-[10px] text-amber-400/80"
                        >
                          <Wrench className="w-3 h-3" />
                          <span className="font-medium">{tr.serviceName}</span>
                          <span className="text-zinc-600">-</span>
                          <span className="truncate">{tr.action}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {streamingText && streamingRole === 'model' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="flex gap-2 max-w-[88%]">
              <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-white/5 text-zinc-400">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="px-3 py-2 rounded-2xl bg-white/[0.04] text-zinc-200 border border-white/5 rounded-tl-sm text-sm leading-relaxed">
                <StreamingText text={streamingText} isActive={isActive} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
