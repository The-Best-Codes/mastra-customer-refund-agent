import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { caseStore } from '../lib/case-store';
import { threadIdForCase, resourceIdForCase, type PolicyMatch } from '../domain/support-case';
import { triageAgent, triageResultSchema } from '../agents/triage-agent';
import { responseAgent, draftResolutionSchema } from '../agents/response-agent';
import { searchSupportKnowledgeTool } from '../tools/search-support-knowledge';
import { lookupOrderTool, lookupSubscriptionTool, lookupCustomerRefundHistoryTool } from '../tools/lookup-order';
import { issueRefundTool, MAX_AUTO_APPROVABLE_REFUND } from '../tools/issue-refund';
import { getActiveSupportAdapter } from '../integrations/active-adapter';

const caseIdSchema = z.object({ caseId: z.string() });

async function getCaseOrThrow(caseId: string) {
  const supportCase = await caseStore.get(caseId);
  if (!supportCase) throw new Error(`Support case not found: ${caseId}`);
  return supportCase;
}

const classifyStep = createStep({
  id: 'classify',
  description: "Runs the triage agent on the customer's message.",
  inputSchema: caseIdSchema,
  outputSchema: caseIdSchema,
  execute: async ({ inputData, tracingContext }) => {
    const supportCase = await getCaseOrThrow(inputData.caseId);
    const latestMessage = supportCase.messages[supportCase.messages.length - 1];

    // Capture the run's trace id once, up front, so the monitoring dashboard can pull
    // token usage and tool-call stats for this case straight from observability storage.
    const traceId = tracingContext?.currentSpan?.traceId;
    if (traceId) {
      await caseStore.update(supportCase.id, { traceId });
    }

    const result = await triageAgent.generate(
      [
        {
          role: 'user',
          content: `Subject: ${supportCase.subject}\n\nMessage:\n${latestMessage.body}`,
        },
      ],
      {
        structuredOutput: { schema: triageResultSchema },
        memory: { thread: threadIdForCase(supportCase.id), resource: resourceIdForCase(supportCase.id) },
      },
    );

    const triageUsage = result.usage;
    await caseStore.update(supportCase.id, {
      triage: result.object,
      status: 'processing',
      agentUsage: {
        inputTokens: triageUsage.inputTokens ?? 0,
        outputTokens: triageUsage.outputTokens ?? 0,
        model: (result as { response?: { modelId?: string } }).response?.modelId,
      },
    });
    return { caseId: supportCase.id };
  },
});

const retrievePolicyStep = createStep({
  id: 'retrieve-policy',
  description: 'Searches the indexed policy knowledge base for context relevant to this case.',
  inputSchema: caseIdSchema,
  outputSchema: caseIdSchema,
  execute: async ({ inputData }) => {
    const supportCase = await getCaseOrThrow(inputData.caseId);
    const latestMessage = supportCase.messages[supportCase.messages.length - 1];
    const queryText = `${supportCase.triage?.intent ?? ''} ${supportCase.subject} ${latestMessage.body}`.trim();

    const result = (await searchSupportKnowledgeTool.execute!(
      { queryText, topK: 5 },
      {} as any,
    )) as { sources?: Array<{ metadata?: Record<string, unknown>; document?: string; score?: number }> };

    const policyMatches: PolicyMatch[] = (result.sources ?? []).map(source => ({
      title: String(source.metadata?.title ?? 'Untitled policy'),
      text: String(source.metadata?.text ?? source.document ?? ''),
      source: String(source.metadata?.source ?? 'unknown'),
      score: source.score ?? 0,
    }));

    await caseStore.update(supportCase.id, { policyMatches });
    return { caseId: supportCase.id };
  },
});

const inspectOrderStep = createStep({
  id: 'inspect-order',
  description: "Looks up the customer's order, subscription, and prior refunds.",
  inputSchema: caseIdSchema,
  outputSchema: caseIdSchema,
  execute: async ({ inputData }) => {
    const supportCase = await getCaseOrThrow(inputData.caseId);

    const orderLookup = (await lookupOrderTool.execute!(
      { customerEmail: supportCase.customer.email },
      {} as any,
    )) as { found: boolean; order?: { orderId: string } };

    const subscriptionLookup = await lookupSubscriptionTool.execute!(
      { customerEmail: supportCase.customer.email },
      {} as any,
    );

    const refundHistory = orderLookup.found
      ? await lookupCustomerRefundHistoryTool.execute!({ orderId: orderLookup.order!.orderId }, {} as any)
      : { refunds: [] };

    await caseStore.update(supportCase.id, {
      orderLookup: orderLookup as any,
      subscriptionLookup: subscriptionLookup as any,
      refundHistory: refundHistory as any,
    });
    return { caseId: supportCase.id };
  },
});

const draftResponseStep = createStep({
  id: 'draft-response',
  description: 'Runs the response agent to draft a grounded reply and refund recommendation.',
  inputSchema: caseIdSchema,
  outputSchema: caseIdSchema,
  execute: async ({ inputData }) => {
    const supportCase = await getCaseOrThrow(inputData.caseId);
    const latestMessage = supportCase.messages[supportCase.messages.length - 1];

    const context = {
      subject: supportCase.subject,
      customerMessage: latestMessage.body,
      customerEmail: supportCase.customer.email,
      triage: supportCase.triage,
      policyMatches: supportCase.policyMatches,
      orderLookup: supportCase.orderLookup,
      subscriptionLookup: supportCase.subscriptionLookup,
      refundHistory: supportCase.refundHistory,
    };

    const result = await responseAgent.generate(
      [
        {
          role: 'user',
          content: `Draft a resolution for this support case. Here is everything retrieved so far as JSON - use only this data, plus your tools if you need to double check something:\n\n${JSON.stringify(context, null, 2)}`,
        },
      ],
      {
        structuredOutput: { schema: draftResolutionSchema },
        memory: { thread: threadIdForCase(supportCase.id), resource: resourceIdForCase(supportCase.id) },
      },
    );

    const responseUsage = result.usage;
    const existingUsage = supportCase.agentUsage;
    await caseStore.update(supportCase.id, {
      draft: result.object,
      agentUsage: {
        inputTokens: (existingUsage?.inputTokens ?? 0) + (responseUsage.inputTokens ?? 0),
        outputTokens: (existingUsage?.outputTokens ?? 0) + (responseUsage.outputTokens ?? 0),
        model: (result as { response?: { modelId?: string } }).response?.modelId ?? existingUsage?.model,
      },
    });
    return { caseId: supportCase.id };
  },
});

const approvalInputSchema = caseIdSchema;
const approvalOutputSchema = z.object({
  caseId: z.string(),
  approved: z.boolean(),
  approverId: z.string().optional(),
  note: z.string().optional(),
});

const requestApprovalStep = createStep({
  id: 'request-approval',
  description: 'Suspends the workflow for human approval when the drafted resolution recommends a refund.',
  inputSchema: approvalInputSchema,
  resumeSchema: z.object({
    approved: z.boolean(),
    approverId: z.string(),
    note: z.string().optional(),
  }),
  suspendSchema: z.object({
    caseId: z.string(),
    refundAmount: z.number(),
    refundCurrency: z.string(),
    refundReason: z.string(),
    orderId: z.string(),
    draftResponse: z.string(),
  }),
  outputSchema: approvalOutputSchema,
  execute: async ({ inputData, resumeData, suspend }) => {
    const supportCase = await getCaseOrThrow(inputData.caseId);
    const draft = supportCase.draft;

    if (!draft?.recommendRefund) {
      return { caseId: supportCase.id, approved: false };
    }

    if (!resumeData) {
      await caseStore.update(supportCase.id, { status: 'waiting_approval' });
      return await suspend({
        caseId: supportCase.id,
        refundAmount: draft.refundAmount ?? 0,
        refundCurrency: draft.refundCurrency ?? 'USD',
        refundReason: draft.refundReason ?? '',
        orderId: supportCase.orderLookup?.order?.orderId ?? '',
        draftResponse: draft.draftResponse,
      });
    }

    await caseStore.update(supportCase.id, {
      approval: {
        approved: resumeData.approved,
        approverId: resumeData.approverId,
        note: resumeData.note,
      },
    });

    return {
      caseId: supportCase.id,
      approved: resumeData.approved,
      approverId: resumeData.approverId,
      note: resumeData.note,
    };
  },
});

const resolveCaseStep = createStep({
  id: 'resolve-case',
  description: 'Executes an approved refund, or marks the case resolved/escalated.',
  inputSchema: approvalOutputSchema,
  outputSchema: z.object({
    caseId: z.string(),
    status: z.enum(['resolved', 'escalated']),
  }),
  execute: async ({ inputData, mastra }) => {
    const supportCase = await getCaseOrThrow(inputData.caseId);
    const draft = supportCase.draft!;
    let finalResponse = draft.draftResponse;
    let status: 'resolved' | 'escalated' = draft.requiresEscalation ? 'escalated' : 'resolved';
    let escalationReason = draft.escalationReason;

    if (draft.recommendRefund) {
      if (!inputData.approved) {
        status = 'escalated';
        escalationReason = `Refund declined by ${inputData.approverId ?? 'reviewer'}${inputData.note ? `: ${inputData.note}` : '.'}`;
        finalResponse = `Thanks for your patience - a specialist is going to take a closer look at your case and follow up shortly.`;
      } else {
        const orderId = supportCase.orderLookup?.order?.orderId;
        if (!orderId) {
          status = 'escalated';
          escalationReason = 'Refund was approved but no order id was on file - needs manual handling.';
        } else if ((draft.refundAmount ?? 0) > MAX_AUTO_APPROVABLE_REFUND) {
          status = 'escalated';
          escalationReason = `Refund amount ${draft.refundAmount} exceeds the ${MAX_AUTO_APPROVABLE_REFUND} auto-approvable limit and needs a senior approver.`;
        } else {
          const refundResult = await issueRefundTool.execute!(
            {
              orderId,
              amount: draft.refundAmount ?? 0,
              currency: draft.refundCurrency ?? 'USD',
              reason: draft.refundReason ?? 'Approved support refund',
              idempotencyKey: supportCase.id,
            },
            {} as any,
          );
          await caseStore.update(supportCase.id, { refundResult: refundResult as any });
          status = 'resolved';
        }
      }
    }

    await caseStore.update(supportCase.id, {
      status,
      finalResponse,
      escalationReason,
      messages: [
        ...supportCase.messages,
        {
          id: `msg_${crypto.randomUUID().slice(0, 8)}`,
          author: 'agent' as const,
          authorName: 'Support Agent',
          body: finalResponse,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    // Sync the outcome back to the source system via whichever adapter is active (mock/Zendesk/...).
    // This is best-effort so a provider hiccup escalates loudly in the logs rather than failing a
    // resolution that's already been decided.
    const adapter = getActiveSupportAdapter();
    const sourceCaseId =
      supportCase.source === 'zendesk'
        ? String(supportCase.metadata?.zendeskTicketId ?? supportCase.externalId)
        : supportCase.externalId;
    const syncBack = async () => {
      await adapter.sendReply(sourceCaseId, finalResponse);
      if (status === 'escalated' && escalationReason) {
        await adapter.addInternalNote(sourceCaseId, `Escalated by support-refund-agent: ${escalationReason}`);
      }
      await adapter.updateStatus(sourceCaseId, status);
    };
    await syncBack().catch(error => {
      mastra?.getLogger()?.warn('Failed to sync case resolution back to source system', {
        error,
        caseId: supportCase.id,
        source: supportCase.source,
      });
    });

    return { caseId: supportCase.id, status };
  },
});

export const resolveSupportCaseWorkflow = createWorkflow({
  id: 'resolve-support-case',
  description:
    'The core resolution pipeline: classify -> retrieve policy -> inspect order -> draft response -> human refund approval -> execute or escalate.',
  inputSchema: caseIdSchema,
  outputSchema: z.object({
    caseId: z.string(),
    status: z.enum(['resolved', 'escalated']),
  }),
})
  .then(classifyStep)
  .then(retrievePolicyStep)
  .then(inspectOrderStep)
  .then(draftResponseStep)
  .then(requestApprovalStep)
  .then(resolveCaseStep)
  .commit();

export const REQUEST_APPROVAL_STEP_ID = requestApprovalStep.id;
