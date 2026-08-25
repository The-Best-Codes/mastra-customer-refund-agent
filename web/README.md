# Support & Refund Agent — Demo UI

A small Vite + React + [shadcn/ui](https://ui.shadcn.com) app that shows the `mastra-customer-refund-agent` backend in action. It's a separate package from the Mastra app (which is the API server) - run both together.

## Pages

- **`/`** — Explainer: how a case flows through the pipeline, and which Mastra primitives are used.
- **`/portal`** — Customer-facing: send a support message (or fire one of the canned example emails) and watch your own cases resolve in real time.
- **`/admin`** — Support-admin: the full case queue, everything the AI found (triage, retrieved policy, order/subscription data, the drafted reply), and the approve/reject controls for pending refunds.

## Run it

From the project root, in one terminal:

```bash
bun run dev # starts the Mastra API on :4111
```

In another terminal:

```bash
cd web
bun install
bun run dev # starts the UI on :5173, proxying /support/* to :4111
```

Then open [http://localhost:5173](http://localhost:5173).

## Configuration

By default the dev server proxies `/support/*` requests to `http://localhost:4111` (see `vite.config.ts`), so no configuration is needed locally. If you deploy the UI separately from the Mastra app, copy `.env.example` to `.env` and set `VITE_API_BASE_URL` to wherever the Mastra app is hosted (and make sure CORS/auth on that server allow it).
