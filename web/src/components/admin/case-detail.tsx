import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge, UrgencyBadge } from '@/components/status-badge';
import { ApprovalCard } from '@/components/admin/approval-card';
import type { SupportCase } from '@/lib/types';
import { AlertTriangle, ArrowUpRight, BadgeCheck, PackageSearch, Receipt, ScrollText } from 'lucide-react';

export function CaseDetail({
  supportCase,
  approverId,
  onDecision,
}: {
  supportCase: SupportCase;
  approverId: string;
  onDecision: (approved: boolean, note?: string) => Promise<void>;
}) {
  const c = supportCase;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{c.subject}</h2>
          <p className="text-sm text-muted-foreground">
            {c.customer.name ?? c.customer.email} &lt;{c.customer.email}&gt; · Case {c.id} · via {c.source}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={c.status} />
          {c.triage && (
            <>
              <Badge variant="secondary" className="capitalize">
                {c.triage.intent.replace(/_/g, ' ')}
              </Badge>
              <UrgencyBadge urgency={c.triage.urgency} />
            </>
          )}
        </div>
      </div>

      {c.status === 'waiting_approval' && (
        <ApprovalCard supportCase={c} approverId={approverId} onDecision={onDecision} />
      )}

      {c.status === 'escalated' && c.escalationReason && (
        <Card className="border-rose-300 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30">
          <CardContent className="flex items-start gap-2 pt-6 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" />
            <div>
              <p className="font-medium text-rose-800 dark:text-rose-300">Escalated</p>
              <p className="text-rose-700/90 dark:text-rose-300/80">{c.escalationReason}</p>
              {c.approval && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Decision by {c.approval.approverId}
                  {c.approval.note ? `: "${c.approval.note}"` : ''}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {c.refundResult && (
        <Card className="border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30">
          <CardContent className="flex items-start gap-2 pt-6 text-sm">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-800 dark:text-emerald-300">
                Refund {c.refundResult.status === 'skipped' ? '(already issued)' : 'issued'}: {c.refundResult.amount}{' '}
                {c.refundResult.currency}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.refundResult.refundId} · order {c.refundResult.orderId} · {new Date(c.refundResult.executedAt).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="conversation">
        <TabsList>
          <TabsTrigger value="conversation">Conversation</TabsTrigger>
          <TabsTrigger value="reasoning">AI reasoning</TabsTrigger>
          <TabsTrigger value="data">Order &amp; policy data</TabsTrigger>
        </TabsList>

        <TabsContent value="conversation" className="space-y-3">
          {c.messages.map(message => (
            <div key={message.id} className={`rounded-md border p-3 text-sm ${message.author === 'agent' ? 'bg-muted/50' : ''}`}>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium capitalize">{message.authorName ?? message.author}</span>
                <span>{new Date(message.createdAt).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap">{message.body}</p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="reasoning" className="space-y-4">
          {c.triage && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ScrollText className="size-4" /> Triage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="capitalize">{c.triage.intent.replace(/_/g, ' ')}</Badge>
                  <UrgencyBadge urgency={c.triage.urgency} />
                  <Badge variant="outline" className="capitalize">{c.triage.sentiment}</Badge>
                  <Badge variant="outline">{Math.round(c.triage.confidence * 100)}% confidence</Badge>
                  {c.triage.requiresHumanReview && <Badge variant="destructive">Flagged for review</Badge>}
                </div>
                <p className="text-muted-foreground">{c.triage.rationale}</p>
              </CardContent>
            </Card>
          )}

          {c.policyMatches && c.policyMatches.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Receipt className="size-4" /> Retrieved policy context
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {c.policyMatches.map((match, i) => (
                  <div key={`${match.source}-${i}`} className="space-y-1 border-b pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{match.title}</span>
                      <span>score {match.score.toFixed(2)}</span>
                    </div>
                    <p className="line-clamp-3 text-muted-foreground">{match.text}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {c.draft && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ArrowUpRight className="size-4" /> Draft resolution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={c.draft.recommendRefund ? 'default' : 'outline'}>
                    {c.draft.recommendRefund ? `Recommends refund` : 'No refund recommended'}
                  </Badge>
                  {c.draft.requiresEscalation && <Badge variant="destructive">Requires escalation</Badge>}
                </div>
                {c.draft.requiresEscalation && c.draft.escalationReason && (
                  <p className="text-muted-foreground">{c.draft.escalationReason}</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <PackageSearch className="size-4" /> Order
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {c.orderLookup?.found && c.orderLookup.order ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">Order ID</dt>
                  <dd>{c.orderLookup.order.orderId}</dd>
                  <dt className="text-muted-foreground">Product</dt>
                  <dd>{c.orderLookup.order.product}</dd>
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd>
                    {c.orderLookup.order.amount} {c.orderLookup.order.currency}
                  </dd>
                  <dt className="text-muted-foreground">Charges</dt>
                  <dd>{c.orderLookup.order.chargeCount}</dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="capitalize">{c.orderLookup.order.status}</dd>
                </dl>
              ) : (
                <p className="text-muted-foreground">No order on file for this customer.</p>
              )}
            </CardContent>
          </Card>

          {c.subscriptionLookup?.found && c.subscriptionLookup.subscription && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Subscription</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd>{c.subscriptionLookup.subscription.plan}</dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="capitalize">{c.subscriptionLookup.subscription.status}</dd>
                  <dt className="text-muted-foreground">Renews</dt>
                  <dd>{new Date(c.subscriptionLookup.subscription.renewsAt).toLocaleDateString()}</dd>
                </dl>
              </CardContent>
            </Card>
          )}

          {c.refundHistory && c.refundHistory.refunds.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Prior refunds</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {c.refundHistory.refunds.map(r => (
                  <div key={r.refundId} className="flex justify-between border-b pb-1 last:border-0">
                    <span>{r.reason}</span>
                    <span className="text-muted-foreground">
                      {r.amount} {r.currency}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Workflow run: {c.workflowRunId ?? '—'} · Last updated {new Date(c.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}
