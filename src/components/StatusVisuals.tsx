import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  ImageOff,
  Lock,
  RotateCcw,
  Send,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import type { ComplaintPriority, ComplaintStatus } from '../types.ts';

export function StatusIndicator({ status }: { status: ComplaintStatus }) {
  const styles: Record<ComplaintStatus, { color: string; Icon: typeof Clock }> = {
    Submitted: { color: 'text-slate-600 dark:text-slate-300', Icon: Send },
    'Under Review': { color: 'text-indigo-600 dark:text-indigo-400', Icon: Eye },
    Assigned: { color: 'text-blue-600 dark:text-blue-400', Icon: UserCheck },
    'In Progress': { color: 'text-amber-600 dark:text-amber-400', Icon: Wrench },
    Resolved: { color: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 },
    Closed: { color: 'text-slate-500 dark:text-slate-400', Icon: Lock },
    Reopened: { color: 'text-rose-600 dark:text-rose-400', Icon: RotateCcw },
  };
  const { color, Icon } = styles[status] ?? styles.Submitted;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${color}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}

export function PriorityIndicator({
  priority,
  escalated,
}: {
  priority: ComplaintPriority;
  escalated?: boolean;
}) {
  const map: Record<ComplaintPriority, string> = {
    Low: 'text-slate-500 dark:text-slate-400',
    Medium: 'text-blue-600 dark:text-blue-400',
    High: 'text-amber-600 dark:text-amber-400',
    Critical: 'text-rose-600 dark:text-rose-400',
  };
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap">
      <span className={map[priority]}>{priority}</span>
      {escalated ? (
        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>SLA Overdue</span>
        </span>
      ) : null}
    </span>
  );
}

const ORDERED_STAGES: ComplaintStatus[] = [
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
  'Closed',
];

export function ComplaintProgressTracker({ status }: { status: ComplaintStatus }) {
  const isReopened = status === 'Reopened';
  const activeIdx = isReopened ? 3 : ORDERED_STAGES.indexOf(status);

  return (
    <div className="w-full">
      {isReopened && (
        <div className="mb-3 flex items-center gap-2 border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 px-3 py-2 rounded-lg text-xs font-medium text-rose-700 dark:text-rose-300">
          <RotateCcw className="h-4 w-4 shrink-0" />
          <span>Ticket Reopened by Student — returned to active resolution workflow.</span>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {ORDERED_STAGES.map((stage, idx) => {
          const completed = idx < activeIdx || (status === 'Closed' && idx === ORDERED_STAGES.length - 1);
          const current = !isReopened && idx === activeIdx && status !== 'Closed';
          return (
            <div
              key={stage}
              className={`border rounded-lg px-3 py-2.5 transition-colors ${
                completed
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : current
                  ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                <span>0{idx + 1}</span>
                {completed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : current ? (
                  <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                ) : null}
              </div>
              <div
                className={`text-xs font-semibold truncate ${
                  completed
                    ? 'text-emerald-800 dark:text-emerald-300'
                    : current
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {stage}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SafeImage({
  src,
  alt,
  className = '',
  fallbackLabel = 'Image unavailable',
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 text-slate-500 dark:text-slate-400 p-4 ${className}`}
      >
        <ImageOff className="h-6 w-6 mb-2 opacity-70" />
        <span className="text-xs font-medium text-center">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
