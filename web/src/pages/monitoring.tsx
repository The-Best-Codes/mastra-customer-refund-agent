import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Progress, ProgressLabel, ProgressTrack, ProgressIndicator } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getMonitoringSummary } from '@/lib/api';
import type { MonitoringSummary } from '@/lib/types';
import {
  AlertTriangle,
  ArrowRight,
  Info,
  MessageSquareWarning,
  RefreshCcw,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Timer,
  Wallet,
} from 'lucide-react';

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(0)}%`;
}

function formatMinutes(value: number | null): string {
  if (value === null) return '—';
  if (value < 1) return '<1 min';
  if (value < 60) return `${value.toFixed(1)} min`;
  return `${(value / 60).toFixed(1)} hr`;
}

function formatMs(value: number): string {
  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`;
}

function formatUsd(value: number): string {
  return value < 0.01 && value > 0 ? '<$0.01' : `$${value.toFixed(2)}`;
}

function RateCard({
  icon: Icon,
  title,
  value,
  description,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  description: string;
  tooltip: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="flex items-center gap-1.5">
            {title}
            <Tooltip>
              <TooltipTrigger>
                <Info className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
          </CardDescription>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export function Monitoring() {
  const [summary, setSummary] = useState<MonitoringSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const result = await getMonitoringSummary();
      setSummary(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load monitoring data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => refresh(true), 8000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Agent monitoring</h1>
          <p className="max-w-2xl text-muted-foreground">
            Containment, escalation, refund approvals, customer feedback, and the token cost and
            tool health data Mastra already tracks for every case.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={refreshing}>
            <RefreshCcw className={refreshing ? 'animate-spin' : ''} data-icon="inline-start" />
            Refresh
          </Button>
          <Button variant="outline" render={<Link to="/admin" />}>
            Open support admin
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </section>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      {!loading && summary && summary.casesConsidered === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No cases yet</EmptyTitle>
            <EmptyDescription>
              Send a sample case from the <Link to="/portal" className="underline">customer portal</Link> to start
              populating this dashboard.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!loading && summary && summary.casesConsidered > 0 && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <RateCard
              icon={ShieldCheck}
              title="Containment rate"
              value={formatPercent(summary.funnel.containmentRate)}
              description={`${summary.funnel.resolved} resolved without escalation, of ${summary.funnel.resolved + summary.funnel.escalated} decided cases.`}
              tooltip="Share of decided cases (resolved or escalated) that the agent closed on its own, without a human taking over."
            />
            <RateCard
              icon={MessageSquareWarning}
              title="Escalation rate"
              value={formatPercent(summary.funnel.escalationRate)}
              description={`${summary.funnel.escalated} of ${summary.funnel.resolved + summary.funnel.escalated} decided cases needed a human.`}
              tooltip="Share of decided cases that were escalated - either a rejected refund, a refund over the auto-approval limit, or a policy the agent couldn't resolve."
            />
            <RateCard
              icon={Wallet}
              title="Refund approval rate"
              value={formatPercent(summary.refunds.approvalRate)}
              description={`${summary.refunds.approved} approved / ${summary.refunds.rejected} rejected of ${summary.refunds.recommended} recommended.`}
              tooltip="Of the refunds a human reviewer decided on, the share that were approved."
            />
            <RateCard
              icon={summary.feedback.up >= summary.feedback.down ? ThumbsUp : ThumbsDown}
              title="Customer satisfaction"
              value={formatPercent(summary.feedback.satisfactionRate)}
              description={`${summary.feedback.totalResponses} rating${summary.feedback.totalResponses === 1 ? '' : 's'} collected via the portal.`}
              tooltip="Share of customers who said the resolution solved their issue, out of everyone who left feedback."
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Case funnel</CardTitle>
                <CardDescription>Where {summary.funnel.totalCases} case{summary.funnel.totalCases === 1 ? '' : 's'} ended up.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm">
                {(
                  [
                    ['New / processing', summary.funnel.new + summary.funnel.processing],
                    ['Waiting approval', summary.funnel.waitingApproval],
                    ['Resolved', summary.funnel.resolved],
                    ['Escalated', summary.funnel.escalated],
                    ['Failed', summary.funnel.failed],
                  ] as const
                ).map(([label, count]) => (
                  <Progress key={label} value={summary.funnel.totalCases > 0 ? (count / summary.funnel.totalCases) * 100 : 0}>
                    <div className="flex w-full items-center justify-between">
                      <ProgressLabel>{label}</ProgressLabel>
                      <span className="text-sm text-muted-foreground tabular-nums">{count}</span>
                    </div>
                    <ProgressTrack>
                      <ProgressIndicator />
                    </ProgressTrack>
                  </Progress>
                ))}
                <Separator />
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Timer className="size-4" />
                  Avg. time to close: {formatMinutes(summary.funnel.avgResolutionMinutes)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Refunds</CardTitle>
                <CardDescription>Human-in-the-loop outcomes for recommended refunds.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Recommended</p>
                  <p className="text-2xl font-semibold">{summary.refunds.recommended}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Approved</p>
                  <p className="text-2xl font-semibold">{summary.refunds.approved}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Rejected</p>
                  <p className="text-2xl font-semibold">{summary.refunds.rejected}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Auto-escalated</p>
                  <p className="text-2xl font-semibold">{summary.refunds.autoEscalated}</p>
                </div>
                <div className="col-span-2">
                  <Separator className="mb-3" />
                  <p className="text-muted-foreground">Total approved &amp; issued</p>
                  <p className="text-2xl font-semibold">
                    {summary.refunds.totalApprovedAmount.toFixed(2)} {summary.refunds.currency}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Token cost by agent</CardTitle>
                <CardDescription>
                  Derived from {summary.traces.tracesInspected} traced case{summary.traces.tracesInspected === 1 ? '' : 's'} -
                  no extra instrumentation required.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary.traces.byAgent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No model calls traced yet.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Agent</TableHead>
                          <TableHead>Calls</TableHead>
                          <TableHead>Tokens (in / out)</TableHead>
                          <TableHead className="text-right">Est. cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.traces.byAgent.map(agent => (
                          <TableRow key={agent.agent}>
                            <TableCell className="font-medium">{agent.agent}</TableCell>
                            <TableCell>{agent.calls}</TableCell>
                            <TableCell>
                              {agent.inputTokens.toLocaleString()} / {agent.outputTokens.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">{formatUsd(agent.estimatedCostUsd)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm font-medium">
                      <span>Total (approx.)</span>
                      <span>{formatUsd(summary.traces.estimatedCostUsd)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cost is a rough estimate from public reference pricing, not your actual bill.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tool performance</CardTitle>
                <CardDescription>Latency and error rate per tool, read straight from span data.</CardDescription>
              </CardHeader>
              <CardContent>
                {summary.traces.tools.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tool calls traced yet.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tool</TableHead>
                          <TableHead>Calls</TableHead>
                          <TableHead>Avg / max latency</TableHead>
                          <TableHead className="text-right">Error rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.traces.tools.map(tool => (
                          <TableRow key={tool.tool}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-1.5">
                                {tool.tool}
                                {summary.traces.slowestTool?.tool === tool.tool && (
                                  <Badge variant="secondary" className="gap-1">
                                    <Timer className="size-3" /> slowest
                                  </Badge>
                                )}
                                {summary.traces.leastReliableTool?.tool === tool.tool && tool.errors > 0 && (
                                  <Badge variant="destructive" className="gap-1">
                                    <AlertTriangle className="size-3" /> flaky
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{tool.calls}</TableCell>
                            <TableCell>
                              {formatMs(tool.avgDurationMs)} / {formatMs(tool.maxDurationMs)}
                            </TableCell>
                            <TableCell className="text-right">{formatPercent(tool.errorRate)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </section>

          {summary.traces.observabilityUnavailable && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Observability storage doesn't support trace lookups</AlertTitle>
              <AlertDescription>
                Token cost and tool stats need a storage provider whose observability domain supports
                <code className="mx-1 rounded bg-muted px-1">getTrace</code>
                (LibSQL, Postgres, and Mastra Platform all do). Configure one in
                <code className="mx-1 rounded bg-muted px-1">src/mastra/index.ts</code>.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent customer feedback</CardTitle>
              <CardDescription>Collected from the customer portal after a case closes.</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.feedback.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No feedback submitted yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {summary.feedback.recent.map(entry => (
                    <div key={entry.caseId} className="flex items-start justify-between gap-3 border-b pb-3 text-sm last:border-0 last:pb-0">
                      <div>
                        <p className="font-medium">{entry.subject}</p>
                        {entry.comment && <p className="text-muted-foreground">{entry.comment}</p>}
                        <p className="text-xs text-muted-foreground">{new Date(entry.submittedAt).toLocaleString()}</p>
                      </div>
                      <Badge variant={entry.rating === 'up' ? 'default' : 'destructive'} className="gap-1">
                        {entry.rating === 'up' ? <ThumbsUp className="size-3" /> : <ThumbsDown className="size-3" />}
                        {entry.rating === 'up' ? 'Resolved' : 'Not resolved'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">Last updated {new Date(summary.generatedAt).toLocaleString()}</p>
        </>
      )}
    </div>
  );
}
