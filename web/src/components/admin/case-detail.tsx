import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Escalated</AlertTitle>
          <AlertDescription>
            <p>{c.escalationReason}</p>
            {c.approval && (
              <p>
                Decision by {c.approval.approverId}
                {c.approval.note ? `: "${c.approval.note}"` : ''}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {c.refundResult && (
        <Alert>
          <BadgeCheck />
          <AlertTitle>
            Refund {c.refundResult.status === 'skipped' ? 'already issued' : 'issued'}: {c.refundResult.amount} {c.refundResult.currency}
          </AlertTitle>
          <AlertDescription>
            {c.refundResult.refundId} · order {c.refundResult.orderId} · {new Date(c.refundResult.executedAt).toLocaleString()}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="conversation">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="conversation">Conversation</TabsTrigger>
          <TabsTrigger value="reasoning">AI reasoning</TabsTrigger>
          <TabsTrigger value="data">Order &amp; policy data</TabsTrigger>
        </TabsList>

        <TabsContent value="conversation" className="space-y-3">
          {c.messages.map(message => (
            <Card key={message.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <CardTitle className="text-sm font-medium capitalize">{message.authorName ?? message.author}</CardTitle>
                  <span>{new Date(message.createdAt).toLocaleString()}</span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{message.body}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="reasoning" className="space-y-4">
          {c.triage && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ScrollText /> Triage
                </CardTitle>
                <CardDescription>How the agent classified the case before drafting a response.</CardDescription>
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
                  <Receipt /> Retrieved policy context
                </CardTitle>
                <CardDescription>The passages pulled from the knowledge base to ground the reply.</CardDescription>
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
                  <ArrowUpRight /> Draft resolution
                </CardTitle>
                <CardDescription>The response draft the workflow prepared for the support team.</CardDescription>
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
                <PackageSearch /> Order
              </CardTitle>
              <CardDescription>The order record looked up before deciding on a refund.</CardDescription>
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
                <CardDescription>Current subscription status for this customer.</CardDescription>
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
                <CardDescription>Earlier refunds issued to the same customer.</CardDescription>
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
        Workflow run: {c.workflowRunId ?? 'Not available'} · Last updated {new Date(c.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}
