import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CaseStatus } from '@/lib/types';

const STATUS_STYLES: Record<CaseStatus, string> = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  processing: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  waiting_approval: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  escalated: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  failed: 'bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300',
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  new: 'New',
  processing: 'Processing',
  waiting_approval: 'Waiting on approval',
  resolved: 'Resolved',
  escalated: 'Escalated',
  failed: 'Failed',
};

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('border-transparent font-medium', STATUS_STYLES[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const URGENCY_STYLES: Record<string, string> = {
  low: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  normal: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

export function UrgencyBadge({ urgency, className }: { urgency: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('border-transparent font-medium capitalize', URGENCY_STYLES[urgency] ?? '', className)}
    >
      {urgency}
    </Badge>
  );
}
