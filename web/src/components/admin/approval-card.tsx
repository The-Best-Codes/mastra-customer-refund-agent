import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { SupportCase } from '@/lib/types';

export function ApprovalCard({
  supportCase,
  approverId,
  onDecision,
}: {
  supportCase: SupportCase;
  approverId: string;
  onDecision: (approved: boolean, note?: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);
  const draft = supportCase.draft;
  if (!draft) return null;

  async function handle(approved: boolean) {
    setPending(approved ? 'approve' : 'reject');
    try {
      await onDecision(approved, note || undefined);
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="border-purple-300 bg-purple-50/60 dark:border-purple-900 dark:bg-purple-950/30">
      <CardHeader>
        <CardTitle className="text-base">Refund approval requested</CardTitle>
        <CardDescription>
          Reviewing as <span className="font-medium">{approverId}</span>. Nothing is charged or refunded until you decide.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Amount</p>
            <p className="font-semibold">
              {draft.refundAmount} {draft.refundCurrency}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Order</p>
            <p className="font-semibold">{supportCase.orderLookup?.order?.orderId ?? '—'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Reason</p>
            <p className="font-medium">{draft.refundReason}</p>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Drafted customer reply</p>
          <p className="rounded-md border bg-background p-3 text-sm whitespace-pre-wrap">{draft.draftResponse}</p>
        </div>
        {draft.citedSources.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {draft.citedSources.map(source => (
              <span key={source} className="rounded bg-background px-2 py-0.5 text-xs text-muted-foreground border">
                {source}
              </span>
            ))}
          </div>
        )}
        <Textarea
          placeholder="Optional note (visible in the case history)"
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
        />
        <div className="flex gap-2">
          <Button onClick={() => handle(true)} disabled={pending !== null} className="gap-2">
            {pending === 'approve' ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Approve refund
          </Button>
          <Button onClick={() => handle(false)} disabled={pending !== null} variant="destructive" className="gap-2">
            {pending === 'reject' ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
            Reject &amp; escalate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
