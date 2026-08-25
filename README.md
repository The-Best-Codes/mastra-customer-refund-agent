# Customer Support Resolution & Refund Agent

A [Mastra](https://mastra.ai) template for a customer support agent that resolves real support cases — but keeps every transactional action (refunds, credits) under human control. Built with [Mastra](https://mastra.ai).

**Flow:** ingest a message → classify intent/urgency → retrieve grounding policy → inspect the order/subscription → draft a grounded response → request human approval for any refund → execute or escalate.

## Why we built this

Support automation is one of the most requested agent use cases, and also one of the easiest to get wrong: the moment an agent can autonomously issue a refund, a hallucinated policy claim or a misread order stops being an annoyance and starts being money out the door. Most "AI support agent" demos either stay safely read-only (answer questions, no actions) or quietly skip the hard part (assume the refund tool is safe to call).

This template shows the middle path: let the agent do the actual work — classify, retrieve policy, look up the order, draft a response, decide whether a refund is warranted — but put a real approval boundary in front of the one action that moves money, using Mastra's workflow `suspend()`/`resume()` rather than a prompt instruction telling the model to "ask first." It also extends the patterns from Mastra's knowledge-base templates (`template-company-knowledge`, `template-chat-with-pdf`) and channel templates (`template-slack-agent`) into a complete case-resolution system: ingestion, RAG grounding, multi-agent triage/drafting, and a human-in-the-loop transactional step, end to end.

## Features

- **`triageAgent` / `responseAgent` / `supportSupervisorAgent`** — a supervisor with two specialist agents (structured-output classification, and grounded drafting + refund recommendation).
- **`resolveSupportCaseWorkflow`** — the resolution pipeline. It suspends with `suspend()` at the approval step and only resumes once a human approves or rejects the recommended refund.
- **`ingestSupportCaseWorkflow`** — normalizes an inbound message, dedupes by external id (idempotent — safe against webhook retries), and kicks off resolution without blocking the caller.
- **RAG knowledge base** — refund/duplicate-charge/damaged-item/shipping/subscription/escalation policy docs, chunked and embedded with `@mastra/rag`, queried with `search_support_knowledge`.
- **Mock commerce + mock inbound email adapter** — no external accounts needed to run the demo. Swap in a real Zendesk/Front/email-webhook adapter behind the same `SupportSourceAdapter` interface when you're ready.
- **One gated transactional tool** — `issue_refund` is the only tool that touches money: capped, idempotent, and never called until a human approves.
- **A demo UI** (`web/`) — a customer portal to open/track cases and a support-admin queue to see exactly what the AI found and to approve or reject refunds.

## Demo

This template ships two ways to see it work:

1. **The included UI** (`web/`) — a customer portal and a support-admin queue. See [`web/README.md`](web/README.md).
2. **[Mastra Studio](https://mastra.ai/docs/studio/overview)** — chat with `supportSupervisorAgent` directly, or watch `resolveSupportCaseWorkflow` suspend and resume live in the Workflows tab.

## Prerequisites

- An OpenAI API key (or another [Gateway-supported](https://mastra.ai/docs/models/gateways/mastra) provider — update the `model` strings in `src/mastra/agents/` if you switch).
- Bun (this template's scripts assume it, but any Node 22+ package manager works too).

## Quickstart 🚀

1. **Add your API key** — set `OPENAI_API_KEY` in `.env` (see `.env.example`).
2. **Start the Mastra app:**
   ```bash
   bun run dev
   ```
   This opens the API server (and [Mastra Studio](http://localhost:4111)) on port `4111`.
3. **Index the policy knowledge base** (once, or whenever you edit `src/mastra/knowledge/docs/`):
   ```bash
   curl -X POST http://localhost:4111/support/knowledge/reindex
   ```
4. **Start the demo UI** in a second terminal:
   ```bash
   cd web
   bun install
   bun run dev
   ```
   Open [http://localhost:5173](http://localhost:5173).

From there:
- Go to **Customer portal** and send one of the canned example emails (or write your own case) — try "I was charged twice" for a case that should end up recommending a refund.
- Go to **Support admin**, open the case, and watch the triage result, retrieved policy, and order lookup the AI used. When it recommends a refund, approve or reject it from the approval card.

### Testing without the UI

```bash
# Submit a mock inbound email
curl -X POST http://localhost:4111/support/inbound \
  -H 'content-type: application/json' \
  -d '{"externalId":"email-1001","from":"alex@example.com","fromName":"Alex Kim","subject":"I was charged twice","body":"I see two charges of $49 this month for my Pro Plan. Can you refund one? Order ORD-1001."}'
# -> { "caseId": "case_xxxxxxxx", "workflowRunId": "...", "status": "processing" }

# Poll until status is "waiting_approval"
curl http://localhost:4111/support/cases/case_xxxxxxxx

# Approve the refund (or POST the same body to /reject instead)
curl -X POST http://localhost:4111/support/cases/case_xxxxxxxx/approve \
  -H 'content-type: application/json' \
  -d '{"approverId":"jamie","note":"Confirmed duplicate charge"}'
```

## How approval works

`resolveSupportCaseWorkflow`'s `request-approval` step calls `suspend()` whenever the response agent recommends a refund, persisting the workflow's state in storage. `POST /support/cases/:id/approve` (or `/reject`) resumes that exact run with a human's decision:

- **Approved** → `issue_refund` runs (capped at `MAX_AUTO_APPROVABLE_REFUND`, idempotent on the case id, so a retried request or double-click can never double-refund).
- **Rejected** → the case is escalated with the reviewer's note attached, and the customer gets a holding response — cases are never silently dropped.

If the drafted resolution doesn't recommend a refund at all, the workflow skips the suspend entirely and resolves (or escalates) immediately.

## API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/support/inbound` | POST | Ingest a message (mock email shape - see `MockEmailPayload`). Idempotent on `externalId`. |
| `/support/mock-emails` | GET | Canned example inbound emails for the demo UI. |
| `/support/cases` | GET | List cases, optionally `?email=` filtered. |
| `/support/cases/:id` | GET | Full case detail (triage, policy matches, order/subscription lookups, draft, approval, refund result). |
| `/support/cases/:id/approve` | POST | `{ approverId, note? }` — approve the pending refund and resume the workflow. |
| `/support/cases/:id/reject` | POST | `{ approverId, note? }` — reject the pending refund; the case is escalated. |
| `/support/knowledge/reindex` | POST | Rebuild the policy vector index from `src/mastra/knowledge/docs/`. |

## Swapping in a real support channel

Everything downstream of ingestion only ever sees a normalized `SupportCase` (`src/mastra/domain/support-case.ts`) — never a raw provider payload. To add Zendesk, Front, or real inbound email:

1. Implement `SupportSourceAdapter` (`src/mastra/integrations/support-source.ts`) for the provider - a `normalizeInbound()` that maps their webhook payload to a `SupportCase`, plus `sendReply()`/`addInternalNote()`/`updateStatus()` to push the agent's response back out.
2. Point the provider's webhook at `POST /support/inbound` (add signature verification — see `template-slack-agent`'s `verifySlackRequest` for the pattern - our mock route accepts unauthenticated requests since there's nothing to verify).
3. Everything else (triage, RAG, order lookups, drafting, approval, refunds) is unchanged.

## Swapping in a real commerce backend

`src/mastra/lib/mock-commerce.ts` holds deterministic order/subscription/refund fixtures. Replace `findOrderByEmail`, `findSubscriptionByEmail`, etc. with real API calls (Shopify, Stripe Billing, an internal orders service) - the tool schemas in `src/mastra/tools/lookup-order.ts` and `issue-refund.ts` don't need to change.

## Making it yours

- **Add more policy docs.** Drop a new file in `src/mastra/knowledge/docs/`, export it from `policy-docs.ts`, and re-run the reindex route.
- **Add specialist agents.** The task calls for `escalationAgent` / `orderAgent` as natural next steps — wire them into `supportSupervisorAgent` and/or as extra workflow steps.
- **Persist cases to a real database.** `src/mastra/lib/case-store.ts` is an in-memory store on purpose (keeps the template dependency-free) - swap it for a `support_cases` table in the same Postgres/LibSQL database backing Mastra storage before shipping this anywhere real.
- **Add evals.** The task calls for groundedness, policy compliance, routing accuracy, tool-call correctness, resolution quality, and multi-turn consistency evals - `src/mastra/index.ts` is where you'd register `@mastra/evals` scorers against `triageAgent` and `responseAgent`.
- **Add monitoring.** Containment rate, escalation rate, refund approvals, and slow/failing tools are all derivable from the `SupportCase` fields already being tracked (`status`, `refundResult`, `escalationReason`) plus the tracing already wired up via `@mastra/observability`.

## About Mastra templates

[Mastra templates](https://mastra.ai/templates) are ready-to-use projects that show off what you can build — clone one, poke around, and make it yours. They live in the [Mastra monorepo](https://github.com/mastra-ai/mastra) and are automatically synced to standalone repositories for easier cloning.

Want to contribute? See the [Mastra contributing guide](https://github.com/mastra-ai/mastra/blob/main/CONTRIBUTING.md).
