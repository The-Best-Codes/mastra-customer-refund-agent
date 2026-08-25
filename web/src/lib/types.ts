// Mirrors src/mastra/domain/support-case.ts on the API side. Kept as plain
// TS types (not shared/imported) since the web app is a separate deployable
// package from the Mastra app.

export type CaseStatus = 'new' | 'processing' | 'waiting_approval' | 'resolved' | 'escalated' | 'failed';

export interface CaseMessage {
  id: string;
  author: 'customer' | 'agent' | 'internal';
  authorName?: string;
  body: string;
  createdAt: string;
}

export interface TriageResult {
  intent:
    | 'refund_request'
    | 'duplicate_charge'
    | 'order_status'
    | 'cancellation'
    | 'damaged_item'
    | 'account_issue'
    | 'other';
  urgency: 'low' | 'normal' | 'high' | 'critical';
  sentiment: 'positive' | 'neutral' | 'negative' | 'angry';
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
    status: 'fulfilled' | 'shipped' | 'processing' | 'cancelled' | 'refunded';
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
    status: 'active' | 'cancelled' | 'past_due';
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
  status: 'executed' | 'skipped';
  idempotencyKey: string;
  executedAt: string;
}

export interface SupportCase {
  id: string;
  externalId: string;
  source: 'mock-email' | 'zendesk' | 'front' | 'chat';
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
}

export interface MockEmailPayload {
  externalId: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  receivedAt?: string;
}
