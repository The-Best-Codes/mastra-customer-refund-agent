# Customer Support Resolution & Refund Agent

A [Mastra](https://mastra.ai) template for a customer support agent that resolves real support cases end to end, but keeps every transactional action (refunds, credits) under human control.

**Flow:** ingest a message → classify intent/urgency → retrieve grounding policy → inspect the order/subscription → draft a grounded response → request human approval for any refund → execute or escalate.

## Why we built this

The moment a support agent can autonomously issue a refund, a hallucinated policy claim or a misread order stops being an annoyance and starts being money out the door. This template shows the middle path: the agent does the real work (classify, retrieve policy, look up the order, draft a response) but a human always approves the one action that moves money, enforced with Mastra's workflow `suspend()`/`resume()` rather than a prompt instruction. It extends the patterns from Mastra's knowledge-base templates (`template-company-knowledge`, `template-chat-with-pdf`) and channel templates (`template-slack-agent`) into a complete case-resolution system.

## Features

- **`triageAgent` / `responseAgent` / `supportSupervisorAgent`**: a supervisor with two specialist agents for structured-output classification and grounded drafting.
- **`resolveSupportCaseWorkflow`**: suspends at the approval step and resumes once a human approves or rejects the recommended refund.
- **`ingestSupportCaseWorkflow`**: normalizes an inbound message and dedupes by external id, so retried webhooks are safe.
- **RAG knowledge base**: refund, duplicate-charge, damaged-item, shipping, subscription, and escalation policy docs, chunked and embedded with `@mastra/rag`, queried with `search_support_knowledge`.
- **Mock commerce + mock inbound email adapter**: no external accounts needed to run the demo. Swap in a real Zendesk/Front/email-webhook adapter behind the same `SupportSourceAdapter` interface when you're ready.
- **One gated transactional tool**: `issue_refund` is capped, idempotent, and only ever called after a human approves.
- **A demo UI** (`web/`): a customer portal and a support-admin queue. See [`web/README.md`](web/README.md).

## Prerequisites

- An OpenAI API key (or another [Gateway-supported provider](https://mastra.ai/docs/models/gateways/mastra); update the `model` strings in `src/mastra/agents/` if you switch).
- Bun (this template's scripts assume it, but any Node 22+ package manager works too).

## Quickstart 🚀

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
2. Start the Mastra app:
   ```bash
   bun run dev
   ```
   This serves the API and [Mastra Studio](http://localhost:4111) on port `4111`.
3. Index the policy knowledge base (once, or after editing `src/mastra/knowledge/docs/`):
   ```bash
   curl -X POST http://localhost:4111/support/knowledge/reindex
   ```
4. Start the demo UI in a second terminal:
   ```bash
   cd web
   bun install
   bun run dev
   ```
   Open [http://localhost:5173](http://localhost:5173).

From there, send a canned example from **Customer portal** (try "I was charged twice"), then open **Support admin** to see the triage result, retrieved policy, and order lookup, and approve or reject the recommended refund.

You can also skip the UI entirely: chat with `supportSupervisorAgent` directly in Mastra Studio, or watch `resolveSupportCaseWorkflow` suspend and resume live in the Workflows tab.

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

`resolveSupportCaseWorkflow`'s `request-approval` step calls `suspend()` whenever the response agent recommends a refund, persisting the run's state in storage. `POST /support/cases/:id/approve` (or `/reject`) resumes that exact run with a human's decision: an approved refund runs through `issue_refund` (capped at `MAX_AUTO_APPROVABLE_REFUND`, idempotent on the case id), while a rejected refund escalates the case with the reviewer's note attached. Cases that never recommend a refund skip the suspend entirely.

## API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/support/inbound` | POST | Ingest a message (mock email shape, see `MockEmailPayload`). Idempotent on `externalId`. |
| `/support/cases` | GET | List cases, optionally `?email=` filtered. |
| `/support/cases/:id` | GET | Full case detail (triage, policy matches, order/subscription lookups, draft, approval, refund result). |
| `/support/cases/:id/approve` | POST | `{ approverId, note? }`. Approves the pending refund and resumes the workflow. |
| `/support/cases/:id/reject` | POST | `{ approverId, note? }`. Rejects the pending refund and escalates the case. |
| `/support/cases/:id/feedback` | POST | `{ rating: 'up' \| 'down', comment? }`. Records customer feedback on the final resolution. |
| `/support/monitoring/summary` | GET | Aggregated containment/escalation rates, refund approvals, customer feedback, token cost, and tool latency/error stats. |
| `/support/knowledge/reindex` | POST | Rebuilds the policy vector index from `src/mastra/knowledge/docs/`. |

## Monitoring

`GET /support/monitoring/summary` (rendered at [`/monitoring`](http://localhost:5173/monitoring) in the demo UI) covers every metric called out in this template's brief:

- **Containment rate / escalation rate** - the share of decided cases (`resolved` vs. `escalated`) the agent closed on its own vs. handed to a human, computed straight from `SupportCase.status`.
- **Refund approvals** - recommended vs. approved vs. rejected vs. auto-escalated (over the `MAX_AUTO_APPROVABLE_REFUND` limit, or missing order data), plus the total dollar amount actually issued.
- **Customer feedback** - a thumbs up/down (plus optional comment) collected from the customer portal once a case closes (`POST /support/cases/:id/feedback`), also forwarded to Mastra's observability feedback API (`mastra.observability.addFeedback`) when the configured storage supports it.
- **Token cost and slow/failing tools** - read directly from the spans Mastra already records for every agent and tool call (via the observability storage domain's `getTrace`), with zero extra instrumentation. Token counts are exact; the dollar figure is a rough estimate from public reference pricing.

All of this lives in `src/mastra/lib/monitoring.ts`, so it's easy to swap in real pricing data or point it at a storage provider (Postgres, Mastra Platform) that also supports the observability metrics/feedback OLAP APIs (`getMetricAggregate`, `getFeedbackAggregate`, etc.) instead of scanning spans directly - useful once case volume outgrows a per-case trace fetch.

## Making it yours

- **Connect a real support channel.** Implement `SupportSourceAdapter` (`src/mastra/integrations/support-source.ts`) for Zendesk, Front, or real inbound email, then point its webhook at `POST /support/inbound`. Everything downstream (triage, RAG, order lookups, drafting, approval, refunds) only ever sees a normalized `SupportCase`.
- **Connect a real commerce backend.** `src/mastra/lib/mock-commerce.ts` holds deterministic order/subscription/refund fixtures; replace them with real calls (Shopify, Stripe Billing, an internal orders service). The tool schemas in `src/mastra/tools/` don't need to change.
- **Persist cases to a real database.** `src/mastra/lib/case-store.ts` is an in-memory store on purpose (keeps the template dependency-free); swap it for a table in the same storage backing Mastra before shipping this anywhere real.
- **Add evals.** Register `@mastra/evals` scorers against `triageAgent` and `responseAgent` in `src/mastra/index.ts` for groundedness, policy compliance, routing accuracy, tool-call correctness, resolution quality, and multi-turn consistency.
- **Add specialist agents.** An `escalationAgent` or `orderAgent` are natural next steps to wire into `supportSupervisorAgent`.

## About Mastra templates

[Mastra templates](https://mastra.ai/templates) are ready-to-use projects that show off what you can build. Clone one, poke around, and make it yours. They live in the [Mastra monorepo](https://github.com/mastra-ai/mastra) and are automatically synced to standalone repositories for easier cloning.

Want to contribute? See the [Mastra contributing guide](https://github.com/mastra-ai/mastra/blob/main/CONTRIBUTING.md).
