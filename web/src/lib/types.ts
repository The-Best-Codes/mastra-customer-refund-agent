// Mirrors src/mastra/domain/support-case.ts on the API side. Kept as plain
// TS types (not shared/imported) since the web app is a separate deployable
// package from the Mastra app.

export type CaseStatus =
  | "new"
  | "processing"
  | "waiting_approval"
  | "resolved"
  | "escalated"
  | "failed";

export interface CaseMessage {
  id: string;
  author: "customer" | "agent" | "internal";
  authorName?: string;
  body: string;
  createdAt: string;
}

export interface TriageResult {
  intent:
    | "refund_request"
    | "duplicate_charge"
    | "order_status"
    | "cancellation"
    | "damaged_item"
    | "account_issue"
    | "other";
  urgency: "low" | "normal" | "high" | "critical";
  sentiment: "positive" | "neutral" | "negative" | "angry";
  requiresHumanReview: boolean;
  confidence: number;
  rationale: string;
}

export interface PolicyMatch {
  title: string;
  text: string;
  source: string;
  score: number;
}

export interface OrderLookup {
  found: boolean;
  order?: {
    orderId: string;
    customerEmail: string;
    product: string;
    amount: number;
    currency: string;
    status: "fulfilled" | "shipped" | "processing" | "cancelled" | "refunded";
    chargeCount: number;
    placedAt: string;
  };
}

export interface SubscriptionLookup {
  found: boolean;
  subscription?: {
    subscriptionId: string;
    customerEmail: string;
    plan: string;
    amount: number;
    currency: string;
    status: "active" | "cancelled" | "past_due";
    renewsAt: string;
  };
}

export interface RefundHistory {
  refunds: Array<{
    refundId: string;
    orderId: string;
    amount: number;
    currency: string;
    reason: string;
    issuedAt: string;
  }>;
}

export interface DraftResolution {
  draftResponse: string;
  citedSources: string[];
  recommendRefund: boolean;
  refundAmount?: number;
  refundCurrency?: string;
  refundReason?: string;
  requiresEscalation: boolean;
  escalationReason?: string;
}

export interface ApprovalDecision {
  approved: boolean;
  approverId: string;
  note?: string;
}

export interface RefundResult {
  refundId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: "executed" | "skipped";
  idempotencyKey: string;
  executedAt: string;
}

export interface CaseFeedback {
  rating: "up" | "down";
  comment?: string;
  submittedAt: string;
}

export interface SupportCase {
  id: string;
  externalId: string;
  source: "mock-email" | "zendesk" | "front" | "chat";
  customer: { email: string; name?: string };
  subject: string;
  messages: CaseMessage[];
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  triage?: TriageResult;
  policyMatches?: PolicyMatch[];
  orderLookup?: OrderLookup;
  subscriptionLookup?: SubscriptionLookup;
  refundHistory?: RefundHistory;
  draft?: DraftResolution;
  approval?: ApprovalDecision;
  refundResult?: RefundResult;
  finalResponse?: string;
  escalationReason?: string;
  workflowRunId?: string;
  traceId?: string;
  feedback?: CaseFeedback;
}

export interface MockEmailPayload {
  externalId: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  receivedAt?: string;
}

// Mirrors src/mastra/lib/monitoring.ts on the API side.

export interface CaseFunnelMetrics {
  totalCases: number;
  new: number;
  processing: number;
  waitingApproval: number;
  resolved: number;
  escalated: number;
  failed: number;
  containmentRate: number | null;
  escalationRate: number | null;
  avgResolutionMinutes: number | null;
}

export interface RefundApprovalMetrics {
  recommended: number;
  approved: number;
  rejected: number;
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
  recent: Array<{
    caseId: string;
    subject: string;
    rating: "up" | "down";
    comment?: string;
    submittedAt: string;
  }>;
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
