import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  ChevronDown,
  X,
  Check,
  Loader2,
  AlertTriangle,
  Clock,
  Filter,
  Trash2,
} from 'lucide-react';
import type { ToolCallEntry, ToolCallStatus } from '../lib/types';
import { getServiceColor, getServiceStatusColorClass } from '../lib/permissions';

interface DesktopViewportProps {
  toolCalls: ToolCallEntry[];
  expanded: boolean;
  onToggle: () => void;
  onDismiss: (id: string) => void;
  onClearDismissed: () => void;
}

type FilterMode = 'all' | 'processing' | 'failed' | 'gmail' | 'drive';

const FILTER_OPTIONS: { key: FilterMode; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'processing', label: 'Active' },
  { key: 'failed', label: 'Failed' },
  { key: 'gmail', label: 'Gmail' },
  { key: 'drive', label: 'Drive' },
];

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function formatDuration(startedAt: number, completedAt?: number): string {
  if (!completedAt) return '';
  const ms = completedAt - startedAt;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusDot({ status }: { status: ToolCallStatus }) {
  const colorClass = getServiceStatusColorClass(status);
  return (
    <div className={`w-2 h-2 rounded-full ${colorClass} shadow-[0_0_6px_currentColor]`} />
  );
}

function StatusIcon({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'pending_confirmation': return <Clock className="w-3.5 h-3.5 text-yellow-400" />;
    case 'processing': return <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />;
    case 'completed': return <Check className="w-3.5 h-3.5 text-emerald-400" />;
    case 'failed': return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
    case 'denied': return <X className="w-3.5 h-3.5 text-zinc-500" />;
    case 'dismissed': return <Trash2 className="w-3.5 h-3.5 text-zinc-700" />;
    default: return <Clock className="w-3.5 h-3.5 text-zinc-600" />;
  }
}

function ToolCallCard({
  entry,
  onDismiss,
  onToggleExpand,
  expanded,
}: {
  entry: ToolCallEntry;
  onDismiss: (id: string) => void;
  onToggleExpand: (id: string) => void;
  expanded: boolean;
}) {
  const colorClass = getServiceColor(entry.serviceName);

  return (
    <div
      className={`rounded-xl border ${colorClass} bg-[#0A0A0B]/90 transition-all ${
        entry.dismissed ? 'opacity-40' : ''
      }`}
    >
      <button
        onClick={() => onToggleExpand(entry.id)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <StatusIcon status={entry.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {entry.serviceName}
            </span>
            <span className="text-[9px] text-zinc-600">
              {formatRelativeTime(entry.startedAt)}
            </span>
          </div>
          <p className="text-xs text-zinc-200 truncate mt-0.5">{entry.action}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {formatDuration(entry.startedAt, entry.completedAt) && (
            <span className="text-[9px] text-zinc-600 font-mono mr-1">
              {formatDuration(entry.startedAt, entry.completedAt)}
            </span>
          )}
          <StatusDot status={entry.status} />
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0 border-t border-white/[0.04] mx-3">
              {(entry.result || entry.error) && (
                <div className="mt-2 rounded-lg bg-black/30 p-2.5 max-h-32 overflow-y-auto">
                  <pre className="text-[10px] leading-relaxed text-zinc-300 whitespace-pre-wrap font-mono">
                    {entry.error || entry.result}
                  </pre>
                </div>
              )}
              {(entry.status === 'failed' || entry.status === 'denied') &&
                !entry.dismissed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss(entry.id);
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Dismiss
                  </button>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DesktopViewport({
  toolCalls,
  expanded,
  onToggle,
  onDismiss,
  onClearDismissed,
}: DesktopViewportProps) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = toolCalls;
    switch (filter) {
      case 'processing':
        list = list.filter(
          (t) =>
            t.status === 'pending_confirmation' ||
            t.status === 'processing' ||
            t.status === 'confirmed',
        );
        break;
      case 'failed':
        list = list.filter((t) => t.status === 'failed' || t.status === 'denied');
        break;
      case 'gmail':
        list = list.filter((t) => t.serviceName.toLowerCase().includes('gmail'));
        break;
      case 'drive':
        list = list.filter((t) => t.serviceName.toLowerCase().includes('drive'));
        break;
    }
    // newest first
    return [...list].reverse();
  }, [toolCalls, filter]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const stats = useMemo(() => {
    const total = toolCalls.length;
    const failed = toolCalls.filter((t) => t.status === 'failed' || t.status === 'denied').length;
    const completed = toolCalls.filter((t) => t.status === 'completed').length;
    const processing = toolCalls.filter(
      (t) =>
        t.status === 'pending_confirmation' ||
        t.status === 'processing' ||
        t.status === 'confirmed',
    ).length;
    return { total, failed, completed, processing };
  }, [toolCalls]);

  const activeCount = toolCalls.filter(
    (t) =>
      t.status === 'pending_confirmation' ||
      t.status === 'processing' ||
      t.status === 'confirmed',
  ).length;

  const failedCount = toolCalls.filter(
    (t) => (t.status === 'failed' || t.status === 'denied') && !t.dismissed,
  ).length;

  // Collapsed tab mode
  if (!expanded) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-[150] flex flex-col items-center gap-1.5 py-5 px-2.5 rounded-l-xl border border-r-0 border-white/10 bg-[#0A0A0B]/90 backdrop-blur-xl shadow-2xl hover:border-amber-500/30 transition-all group"
      >
        {activeCount > 0 && (
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
        )}
        {failedCount > 0 && (
          <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
        )}
        {toolCalls.filter((t) => t.status === 'completed').length > 0 && (
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
        )}
        <span className="text-[9px] font-bold text-zinc-500 group-hover:text-zinc-300 transition-colors vertical-text">
          TOOLS
        </span>
        {(activeCount > 0 || failedCount > 0) && (
          <span className="text-[10px] font-bold text-amber-500">
            {activeCount > 0 ? activeCount : failedCount}
          </span>
        )}
      </button>
    );
  }

  // Expanded panel
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 bottom-0 z-[150] w-[380px] max-w-[calc(100vw-48px)] border-l border-white/10 bg-[#060607]/95 backdrop-blur-2xl shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="shrink-0 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500/70" />
            <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
              Tool Timeline
            </h3>
          </div>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all ${
                filter === opt.key
                  ? 'bg-white/10 text-white border border-white/15'
                  : 'bg-transparent text-zinc-600 border border-transparent hover:text-zinc-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="shrink-0 px-4 py-2 border-b border-white/[0.04] flex items-center gap-4 text-[9px] font-mono text-zinc-600">
        <span>{stats.total} calls</span>
        {stats.processing > 0 && <span className="text-amber-500">{stats.processing} active</span>}
        {stats.completed > 0 && <span className="text-emerald-500">{stats.completed} done</span>}
        {stats.failed > 0 && <span className="text-red-500">{stats.failed} failed</span>}
        <div className="flex-1" />
        {toolCalls.some((t) => t.dismissed) && (
          <button
            onClick={onClearDismissed}
            className="flex items-center gap-1 text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear dismissed
          </button>
        )}
      </div>

      {/* Scrollable entries */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        <AnimatePresence initial={false}>
          {filtered.map((entry) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: 20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -20, transition: { duration: 0.15 } }}
              layout
            >
              <ToolCallCard
                entry={entry}
                onDismiss={onDismiss}
                onToggleExpand={toggleExpand}
                expanded={expandedIds.has(entry.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Filter className="w-8 h-8 text-zinc-800" />
            <p className="text-[10px] uppercase tracking-widest text-zinc-700 font-bold">
              No tool calls yet
            </p>
            <p className="text-[9px] text-zinc-700">
              Agent actions will appear here
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
