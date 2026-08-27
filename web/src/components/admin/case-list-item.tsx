import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { StatusBadge, UrgencyBadge } from '@/components/status-badge';
import type { SupportCase } from '@/lib/types';

export function CaseListItem({
  supportCase,
  selected,
  onSelect,
}: {
  supportCase: SupportCase;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted',
        selected && 'border-primary bg-muted',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-1 font-medium">{supportCase.subject}</p>
        <StatusBadge status={supportCase.status} />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {supportCase.customer.name ?? supportCase.customer.email} · {supportCase.id}
      </p>
      <div className="mt-2 flex items-center gap-1.5">
        {supportCase.triage && (
          <>
            <Badge variant="secondary" className="capitalize">
              {supportCase.triage.intent.replace(/_/g, ' ')}
            </Badge>
            <UrgencyBadge urgency={supportCase.triage.urgency} />
          </>
        )}
      </div>
    </button>
  );
}
