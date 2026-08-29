import { registerApiRoute } from '@mastra/core/server';
import { caseStore } from '../lib/case-store';
import { REQUEST_APPROVAL_STEP_ID } from '../workflows/resolve-support-case';
import { computeMonitoringSummary } from '../lib/monitoring';
import type { CaseFeedback } from '../domain/support-case';

/**
 * POST /support/inbound
 *
 * The single ingestion endpoint for this template. In production you'd point
 * your email/Zendesk/Front webhook here (each provider gets its own adapter
 * behind `SupportSourceAdapter`); for the demo it accepts a mock inbound
 * email payload shaped like `MockEmailPayload`.
 */
export const supportInboundRoute = registerApiRoute('/support/inbound', {
  method: 'POST',
  handler: async c => {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body.' }, 400);
    }

    const mastra = c.get('mastra');
    const ingestWorkflow = mastra.getWorkflow('ingestSupportCaseWorkflow');
    const run = await ingestWorkflow.createRun();

    let result;
    try {
      result = await run.start({ inputData: { payload } });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }

    if (result.status !== 'success') {
      return c.json({ error: 'Ingestion failed.', result }, 500);
    }

    return c.json({
      caseId: result.result.caseId,
      workflowRunId: result.result.workflowRunId,
      status: 'processing',
    });
  },
});

/** GET /support/cases - case inbox for the demo UI, newest first. Optionally filtered by `?email=` for the customer portal. */
export const supportCasesListRoute = registerApiRoute('/support/cases', {
  method: 'GET',
  handler: async c => {
    const email = c.req.query('email');
    const cases = email
      ? caseStore.list().filter(supportCase => supportCase.customer.email.toLowerCase() === email.toLowerCase())
      : caseStore.list();
    return c.json({ cases });
  },
});

export const supportCaseDetailRoute = registerApiRoute('/support/cases/:caseId', {
  method: 'GET',
  handler: async c => {
    const supportCase = caseStore.get(c.req.param('caseId'));
    if (!supportCase) return c.json({ error: 'Case not found.' }, 404);
    return c.json(supportCase);
  },
});

async function resumeApproval(c: any, approved: boolean) {
  const caseId = c.req.param('caseId');
  const supportCase = caseStore.get(caseId);
  if (!supportCase) return c.json({ error: 'Case not found.' }, 404);
  if (!supportCase.workflowRunId) {
    return c.json({ error: 'This case has no in-flight resolution workflow run.' }, 409);
  }
  if (supportCase.status !== 'waiting_approval') {
    return c.json({ error: `Case is not waiting for approval (status: ${supportCase.status}).` }, 409);
  }

  let body: { approverId?: string; note?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // no-op
  }

  const mastra = c.get('mastra');
  const resolveWorkflow = mastra.getWorkflow('resolveSupportCaseWorkflow');
  const run = await resolveWorkflow.createRun({ runId: supportCase.workflowRunId });

  try {
    const result = await run.resume({
      step: REQUEST_APPROVAL_STEP_ID,
      resumeData: {
        approved,
        approverId: body.approverId ?? 'demo-support-lead',
        note: body.note,
      },
    });

    if (result.status === 'failed') {
      return c.json({ error: 'Resolution failed after resume.', result }, 500);
    }

    return c.json(caseStore.get(caseId));
  } catch (error: any) {
    if (error?.id === 'WORKFLOW_RESUME_ALREADY_CLAIMED') {
      return c.json({ error: 'This approval was already submitted.' }, 409);
    }
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

export const supportCaseApproveRoute = registerApiRoute('/support/cases/:caseId/approve', {
  method: 'POST',
  handler: async c => resumeApproval(c, true),
});

export const supportCaseRejectRoute = registerApiRoute('/support/cases/:caseId/reject', {
  method: 'POST',
  handler: async c => resumeApproval(c, false),
});

/**
 * POST /support/cases/:caseId/feedback
 *
 * Lets the customer (or the admin, testing on their behalf) rate the final resolution. Stored
 * on the case for the monitoring dashboard, and forwarded to Mastra's observability feedback
 * API (`mastra.observability.addFeedback`) best-effort so it shows up alongside the case's
 * trace when the configured storage provider supports the observability feedback domain.
 */
export const supportCaseFeedbackRoute = registerApiRoute('/support/cases/:caseId/feedback', {
  method: 'POST',
  handler: async c => {
    const caseId = c.req.param('caseId');
    const supportCase = caseStore.get(caseId);
    if (!supportCase) return c.json({ error: 'Case not found.' }, 404);

    let body: { rating?: string; comment?: string } = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body.' }, 400);
    }

    if (body.rating !== 'up' && body.rating !== 'down') {
      return c.json({ error: "rating must be 'up' or 'down'." }, 400);
    }

    const feedback: CaseFeedback = {
      rating: body.rating,
      comment: body.comment,
      submittedAt: new Date().toISOString(),
    };
    const updated = caseStore.update(caseId, { feedback });

    const mastra = c.get('mastra');
    if (supportCase.traceId && mastra.observability.addFeedback) {
      try {
        await mastra.observability.addFeedback({
          traceId: supportCase.traceId,
          feedback: {
            feedbackSource: 'user',
            feedbackType: 'thumbs',
            value: feedback.rating === 'up' ? 1 : -1,
            comment: feedback.comment,
          },
        });
      } catch (error) {
        mastra.getLogger()?.warn('Failed to forward case feedback to observability storage', { error, caseId });
      }
    }

    return c.json(updated);
  },
});

/**
 * GET /support/monitoring/summary
 *
 * Aggregates the metrics called out in this template's brief: containment rate, escalation
 * rate, refund approvals, customer feedback, token cost, and slow/failing tools. The funnel,
 * refund, and feedback numbers come straight from the case store; token usage and tool
 * latency/reliability are derived from the spans Mastra already records for every agent and
 * tool call, read via the observability storage domain (see `src/mastra/lib/monitoring.ts`).
 */
export const supportMonitoringSummaryRoute = registerApiRoute('/support/monitoring/summary', {
  method: 'GET',
  handler: async c => {
    const mastra = c.get('mastra');
    const summary = await computeMonitoringSummary(mastra);
    return c.json(summary);
  },
});

export const supportKnowledgeReindexRoute = registerApiRoute('/support/knowledge/reindex', {
  method: 'POST',
  handler: async c => {
    const mastra = c.get('mastra');
    const workflow = mastra.getWorkflow('indexSupportKnowledgeWorkflow');
    const run = await workflow.createRun();
    const result = await run.start({ inputData: {} });
    if (result.status !== 'success') {
      return c.json({ error: 'Indexing failed.', result }, 500);
    }
    return c.json(result.result);
  },
});

export const supportRoutes = [
  supportInboundRoute,
  supportCasesListRoute,
  supportCaseDetailRoute,
  supportCaseApproveRoute,
  supportCaseRejectRoute,
  supportCaseFeedbackRoute,
  supportMonitoringSummaryRoute,
  supportKnowledgeReindexRoute,
];
