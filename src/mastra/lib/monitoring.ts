import type { Mastra } from '@mastra/core/mastra';
import { SpanType } from '@mastra/core/observability';
import { caseStore } from './case-store';
import type { SupportCase } from '../domain/support-case';

const TOOL_SPAN_TYPES: ReadonlySet<SpanType> = new Set([
  SpanType.TOOL_CALL,
  SpanType.MCP_TOOL_CALL,
  SpanType.PROVIDER_TOOL_CALL,
]);

/**
 * Rough public reference pricing ($ / 1M tokens), used only to turn raw token counts into an
 * approximate "token cost" figure for the monitoring dashboard when a span doesn't carry a
 * provider-reported cost. Real deployments should replace this with their gateway's billing
 * data (or read `mastra_model_total_*_tokens` cost metrics from a storage provider that
 * implements the observability metrics domain, e.g. Postgres or Mastra Platform).
 */
const REFERENCE_PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'gpt-5': { input: 1.25, output: 10 },
  'gpt-5-mini': { input: 0.25, output: 2 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};
const DEFAULT_PRICING = { input: 0.5, output: 1.5 };

function estimateCostUsd(model: string | undefined, inputTokens: number, outputTokens: number): number {
  const key = model ? Object.keys(REFERENCE_PRICING_PER_MILLION_TOKENS).find(name => model.includes(name)) : undefined;
  const pricing = key ? REFERENCE_PRICING_PER_MILLION_TOKENS[key] : DEFAULT_PRICING;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

function minutesBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000;
}

export interface CaseFunnelMetrics {
  totalCases: number;
  new: number;
  processing: number;
  waitingApproval: number;
  resolved: number;
  escalated: number;
  failed: number;
  /** resolved / (resolved + escalated) - the share of decided cases the agent closed on its own. */
  containmentRate: number | null;
  /** escalated / (resolved + escalated). */
  escalationRate: number | null;
  avgResolutionMinutes: number | null;
}

export interface RefundApprovalMetrics {
  recommended: number;
  approved: number;
  rejected: number;
  /** Refunds the response agent recommended but that were escalated automatically (no order on file, over the auto-approval limit, etc). */
  autoEscalated: number;
  approvalRate: number | null;
  totalApprovedAmount: number;
  currency: string;
}

export interface FeedbackMetrics {
  totalResponses: number;
  up: number;
  down: number;
  satisfactionRate: number | null;
  recent: Array<{ caseId: string; subject: string; rating: 'up' | 'down'; comment?: string; submittedAt: string }>;
}

export interface ToolStat {
  tool: string;
  calls: number;
  errors: number;
  errorRate: number;
  avgDurationMs: number;
  maxDurationMs: number;
}

export interface AgentTokenUsage {
  agent: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface TraceMetrics {
  tracesInspected: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  byAgent: AgentTokenUsage[];
  tools: ToolStat[];
  slowestTool: ToolStat | null;
  leastReliableTool: ToolStat | null;
  /** True once at least one storage-backed trace lookup failed or was unsupported, so the UI can hint at the limitation. */
  observabilityUnavailable: boolean;
}

export interface MonitoringSummary {
  generatedAt: string;
  casesConsidered: number;
  funnel: CaseFunnelMetrics;
  refunds: RefundApprovalMetrics;
  feedback: FeedbackMetrics;
  traces: TraceMetrics;
}

export function computeCaseFunnelMetrics(cases: SupportCase[]): CaseFunnelMetrics {
  const byStatus = {
    new: 0,
    processing: 0,
    waiting_approval: 0,
    resolved: 0,
    escalated: 0,
    failed: 0,
  };
  for (const supportCase of cases) {
    byStatus[supportCase.status] += 1;
  }

  const decided = byStatus.resolved + byStatus.escalated;
  const resolutionMinutes = cases
    .filter(c => c.status === 'resolved' || c.status === 'escalated')
    .map(c => minutesBetween(c.createdAt, c.updatedAt))
    .filter(n => Number.isFinite(n) && n >= 0);

  return {
    totalCases: cases.length,
    new: byStatus.new,
    processing: byStatus.processing,
    waitingApproval: byStatus.waiting_approval,
    resolved: byStatus.resolved,
    escalated: byStatus.escalated,
    failed: byStatus.failed,
    containmentRate: decided > 0 ? byStatus.resolved / decided : null,
    escalationRate: decided > 0 ? byStatus.escalated / decided : null,
    avgResolutionMinutes:
      resolutionMinutes.length > 0 ? resolutionMinutes.reduce((sum, n) => sum + n, 0) / resolutionMinutes.length : null,
  };
}

export function computeRefundApprovalMetrics(cases: SupportCase[]): RefundApprovalMetrics {
  const recommendedCases = cases.filter(c => c.draft?.recommendRefund);
  const approved = recommendedCases.filter(c => c.approval?.approved === true).length;
  const rejected = recommendedCases.filter(c => c.approval?.approved === false).length;
  const autoEscalated = recommendedCases.filter(c => !c.approval && c.status === 'escalated').length;
  const decided = approved + rejected;
  const executedRefunds = cases.filter(c => c.refundResult?.status === 'executed');

  return {
    recommended: recommendedCases.length,
    approved,
    rejected,
    autoEscalated,
    approvalRate: decided > 0 ? approved / decided : null,
    totalApprovedAmount: executedRefunds.reduce((sum, c) => sum + (c.refundResult?.amount ?? 0), 0),
    currency: executedRefunds[0]?.refundResult?.currency ?? 'USD',
  };
}

export function computeFeedbackMetrics(cases: SupportCase[]): FeedbackMetrics {
  const withFeedback = cases.filter(
    (c): c is SupportCase & { feedback: NonNullable<SupportCase['feedback']> } => !!c.feedback,
  );
  const up = withFeedback.filter(c => c.feedback.rating === 'up').length;
  const down = withFeedback.filter(c => c.feedback.rating === 'down').length;

  return {
    totalResponses: withFeedback.length,
    up,
    down,
    satisfactionRate: withFeedback.length > 0 ? up / withFeedback.length : null,
    recent: [...withFeedback]
      .sort((a, b) => (a.feedback.submittedAt < b.feedback.submittedAt ? 1 : -1))
      .slice(0, 10)
      .map(c => ({
        caseId: c.id,
        subject: c.subject,
        rating: c.feedback.rating,
        comment: c.feedback.comment,
        submittedAt: c.feedback.submittedAt,
      })),
  };
}

/**
 * Derives token usage and tool-call latency/reliability stats straight from the spans Mastra
 * already records for every agent and tool call (no extra instrumentation required). Reads
 * exactly the traces tied to the cases we care about, via the observability storage domain
 * configured on the Mastra instance (see `src/mastra/index.ts`).
 */
async function computeTraceMetrics(mastra: Mastra, cases: SupportCase[], maxTraces = 30): Promise<TraceMetrics> {
  const emptyResult: TraceMetrics = {
    tracesInspected: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    estimatedCostUsd: 0,
    byAgent: [],
    tools: [],
    slowestTool: null,
    leastReliableTool: null,
    observabilityUnavailable: false,
  };

  const observability = await mastra.getStorage()?.getStore('observability');
  if (!observability) {
    return { ...emptyResult, observabilityUnavailable: true };
  }

  // Cases are already newest-first (see CaseStore.list()), so this naturally samples the most
  // recent traces when there are more cases than `maxTraces`.
  const traceIds = [...new Set(cases.map(c => c.traceId).filter((id): id is string => !!id))].slice(0, maxTraces);

  const agentUsage = new Map<string, { calls: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number }>();
  const toolUsage = new Map<string, { calls: number; errors: number; totalDurationMs: number; maxDurationMs: number }>();

  let inspected = 0;
  let observabilityUnavailable = false;

  for (const traceId of traceIds) {
    let trace: Awaited<ReturnType<typeof observability.getTrace>>;
    try {
      trace = await observability.getTrace({ traceId });
    } catch {
      observabilityUnavailable = true;
      continue;
    }
    if (!trace) continue;
    inspected += 1;

    for (const span of trace.spans) {
      if (span.spanType === SpanType.MODEL_GENERATION) {
        const attrs = (span.attributes ?? {}) as { usage?: { inputTokens?: number; outputTokens?: number }; model?: string };
        const inputTokens = attrs.usage?.inputTokens ?? 0;
        const outputTokens = attrs.usage?.outputTokens ?? 0;
        const agentName = span.parentEntityName ?? span.entityName ?? 'unknown-agent';

        const bucket = agentUsage.get(agentName) ?? { calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
        bucket.calls += 1;
        bucket.inputTokens += inputTokens;
        bucket.outputTokens += outputTokens;
        bucket.estimatedCostUsd += estimateCostUsd(attrs.model, inputTokens, outputTokens);
        agentUsage.set(agentName, bucket);
      }

      if (span.spanType && TOOL_SPAN_TYPES.has(span.spanType) && span.startedAt && span.endedAt) {
        const toolName = span.entityName ?? 'unknown-tool';
        const durationMs = new Date(span.endedAt).getTime() - new Date(span.startedAt).getTime();

        const bucket = toolUsage.get(toolName) ?? { calls: 0, errors: 0, totalDurationMs: 0, maxDurationMs: 0 };
        bucket.calls += 1;
        if (span.error) bucket.errors += 1;
        bucket.totalDurationMs += durationMs;
        bucket.maxDurationMs = Math.max(bucket.maxDurationMs, durationMs);
        toolUsage.set(toolName, bucket);
      }
    }
  }

  const byAgent: AgentTokenUsage[] = [...agentUsage.entries()]
    .map(([agent, usage]) => ({ agent, ...usage }))
    .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));

  const tools: ToolStat[] = [...toolUsage.entries()]
    .map(([tool, usage]) => ({
      tool,
      calls: usage.calls,
      errors: usage.errors,
      errorRate: usage.calls > 0 ? usage.errors / usage.calls : 0,
      avgDurationMs: usage.calls > 0 ? usage.totalDurationMs / usage.calls : 0,
      maxDurationMs: usage.maxDurationMs,
    }))
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs);

  return {
    tracesInspected: inspected,
    totalInputTokens: byAgent.reduce((sum, a) => sum + a.inputTokens, 0),
    totalOutputTokens: byAgent.reduce((sum, a) => sum + a.outputTokens, 0),
    estimatedCostUsd: byAgent.reduce((sum, a) => sum + a.estimatedCostUsd, 0),
    byAgent,
    tools,
    slowestTool: tools.length > 0 ? [...tools].sort((a, b) => b.avgDurationMs - a.avgDurationMs)[0] : null,
    leastReliableTool:
      tools.length > 0 && tools.some(t => t.errors > 0) ? [...tools].sort((a, b) => b.errorRate - a.errorRate)[0] : null,
    observabilityUnavailable,
  };
}

export async function computeMonitoringSummary(mastra: Mastra): Promise<MonitoringSummary> {
  const cases = caseStore.list();
  const [funnel, refunds, feedback, traces] = await Promise.all([
    computeCaseFunnelMetrics(cases),
    computeRefundApprovalMetrics(cases),
    computeFeedbackMetrics(cases),
    computeTraceMetrics(mastra, cases),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    casesConsidered: cases.length,
    funnel,
    refunds,
    feedback,
    traces,
  };
}
