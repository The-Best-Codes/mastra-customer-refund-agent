import { registerApiRoute } from '@mastra/core/server';
import { caseStore } from '../lib/case-store';
import { MOCK_INBOUND_EMAILS } from '../integrations/mock-support';
import { REQUEST_APPROVAL_STEP_ID } from '../workflows/resolve-support-case';

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

export const supportMockEmailsRoute = registerApiRoute('/support/mock-emails', {
  method: 'GET',
  handler: async c => c.json({ emails: MOCK_INBOUND_EMAILS }),
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
  supportMockEmailsRoute,
  supportCasesListRoute,
  supportCaseDetailRoute,
  supportCaseApproveRoute,
  supportCaseRejectRoute,
  supportKnowledgeReindexRoute,
];
