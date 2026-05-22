import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Check, X, Clock, AlertTriangle, Zap } from 'lucide-react';
import type { PendingToolCall } from '../lib/types';

interface ToolConfirmationModalProps {
  pending: PendingToolCall;
  onConfirm: (id: string) => void;
  onDeny: (id: string) => void;
}

export default function ToolConfirmationModal({
  pending,
  onConfirm,
  onDeny,
}: ToolConfirmationModalProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onDeny(pending.id);
    }, 45000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pending.id, onDeny]);

  const riskBadge = () => {
    switch (pending.risk) {
      case 'destructive':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-[10px] font-bold uppercase tracking-wider text-red-400">
            <AlertTriangle className="w-3 h-3" />
            Destructive
          </div>
        );
      case 'write':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-[10px] font-bold uppercase tracking-wider text-yellow-400">
            <Zap className="w-3 h-3" />
            Write
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            <Check className="w-3 h-3" />
            Read
          </div>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[190] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 16 }}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0A0A0B] shadow-[0_32px_96px_rgba(0,0,0,0.6)] overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Confirm Tool Action</h3>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5">
                The agent wants to execute
              </p>
            </div>
          </div>

          {/* Action detail */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-500">
                {pending.serviceName}
              </span>
              {riskBadge()}
            </div>
            <p className="text-sm text-zinc-200 leading-relaxed">{pending.action}</p>
          </div>

          <div className="flex items-center gap-2 mt-3 text-[10px] text-zinc-600">
            <Clock className="w-3 h-3" />
            <span>Auto-denies in 45 seconds</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-0 border-t border-white/[0.06]">
          <button
            onClick={() => onDeny(pending.id)}
            className="flex items-center justify-center gap-2 py-4 text-sm font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.03] transition-colors border-r border-white/[0.04]"
          >
            <X className="w-4 h-4" />
            Deny
          </button>
          <button
            onClick={() => onConfirm(pending.id)}
            className="flex items-center justify-center gap-2 py-4 text-sm font-semibold text-black bg-amber-500 hover:bg-amber-400 transition-colors active:scale-[0.99] rounded-br-2xl"
          >
            <Check className="w-4 h-4" />
            Confirm
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
