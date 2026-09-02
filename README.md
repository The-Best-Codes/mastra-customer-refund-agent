# Customer Support Resolution and Refund Agent

A [Mastra](https://mastra.ai) template for a customer support agent that resolves real support cases end to end while keeping refunds and credits under human control. It combines triage, policy retrieval, order lookup, grounded response drafting, and a required human approval step before any refund is issued.

## Why we built this

Once a support agent can issue refunds, a bad policy citation or a mistaken order lookup becomes a real financial risk. This template shows a safer pattern: let the agent do the support work, but require a human to approve the one action that moves money.

It demonstrates several Mastra patterns working together in one system: multi-agent orchestration, RAG over support policy docs, workflow suspension and resume for human approval, and gated tool execution for transactional actions.

## Demo

This demo runs in Mastra Studio, but it also includes a demo UI in `web/` with a customer portal and a support admin queue. The customer portal lets you submit sample support requests. The admin queue shows the case, the retrieved policy, the draft response, and the refund approval decision.

You can also connect this workflow to your React, Next.js, or Vue app using the [Mastra Client SDK](https://mastra.ai/docs/server/mastra-client) or agentic UI libraries like [AI SDK UI](https://mastra.ai/guides/build-your-ui/ai-sdk-ui), [CopilotKit](https://mastra.ai/guides/build-your-ui/copilotkit), or [Assistant UI](https://mastra.ai/guides/build-your-ui/assistant-ui).

## Prerequisites

- [OpenAI API key](https://platform.openai.com/api-keys): Used by default, but you can swap in any model
- Bun: used by this template's scripts

## Quickstart 🚀

1. **Clone the template**
   - Run `npx create-mastra@latest --template customer-refund-agent` to scaffold the project locally.
2. **Add your API keys**
   - Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
3. **Start the Mastra app**
   - Run `bun run dev` and open [localhost:4111](http://localhost:4111).
4. **Start the demo UI**
   - In a second terminal, run `cd web`, `bun install`, and `bun run dev`, then open [localhost:5173](http://localhost:5173).

From the customer portal, submit a sample case such as "I was charged twice". Then open the support admin queue to review the triage result, policy grounding, order lookup, and draft response. If the case recommends a refund, approve or reject it from the admin UI.

## Making it yours

This template is meant to be a starting point for real support operations.

- **Swap in a real support channel**: the default adapter is a mock inbound email source so the demo works without external accounts. To use Zendesk, set `SUPPORT_SOURCE=zendesk` and fill in the Zendesk credentials from `.env.example`. The adapter lives in `src/mastra/integrations/zendesk-support.ts`. See [docs/zendesk-deployment.md](./docs/zendesk-deployment.md) for a full walkthrough (confidential OAuth client, webhook + trigger setup, signature verification, and deploying the server so Zendesk can reach it).
- **Replace the mock commerce backend**: `src/mastra/lib/mock-commerce.ts` contains deterministic order, subscription, and refund fixtures. Replace it with calls to Shopify, Stripe Billing, or your internal orders system.
- **Case storage**: `src/mastra/lib/case-store.ts` persists cases to the same libSQL database as the rest of the app's Mastra storage - a local `file:./mastra.db` file by default, or Turso in production when `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` are set (see `.env.example`). Swap in a different backend if you need one (e.g. a dedicated Postgres table) by reimplementing `CaseStore`.
- **Adjust the approval policy**: `resolveSupportCaseWorkflow` suspends when a refund is recommended and resumes after a human decision. The `issue_refund` tool is capped and idempotent, so you can tune the approval and refund limits to match your business rules.
- **Extend the agent system**: `triageAgent`, `responseAgent`, and `supportSupervisorAgent` live in `src/mastra/agents/`. Add more specialist agents or evals in `src/mastra/index.ts` as your workflow grows.
- **Customize the knowledge base**: support policy docs live in `src/mastra/knowledge/docs/` and are indexed for `search_support_knowledge`. Replace them with your own refund, shipping, subscription, and escalation policies.

## About Mastra templates

[Mastra templates](https://mastra.ai/templates) are ready-to-use projects that show off what you can build. Clone one, poke around, and make it yours. They live in the [Mastra monorepo](https://github.com/mastra-ai/mastra) and are automatically synced to standalone repositories for easier cloning.

Want to contribute? See [CONTRIBUTING.md](./CONTRIBUTING.md).
