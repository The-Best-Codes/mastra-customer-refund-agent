# Deploying with Zendesk

This guide walks through wiring this template's support pipeline to a real Zendesk Support instance instead of the built-in mock email adapter, and then deploying the Mastra server somewhere Zendesk can reach it over the internet.

The Zendesk adapter is in [`src/mastra/integrations/zendesk-support.ts`](../src/mastra/integrations/zendesk-support.ts). It implements the same `SupportSourceAdapter` interface as the mock adapter (`src/mastra/integrations/mock-support.ts`), so nothing in the agents, tools, or workflows needs to change - only environment variables and Zendesk-side configuration.

## Prerequisites

- A Zendesk account with admin access (Admin Center > Apps and integrations > Webhooks and APIs).
- This app deployed somewhere with a public HTTPS URL that Zendesk can reach (see [Step 6: Deploy](#step-6-deploy) below). Zendesk webhooks cannot call `localhost`, so local development requires a tunnel (see [Local development with a tunnel](#local-development-with-a-tunnel)).

## Step 1: Create a Zendesk API token

1. In Admin Center, go to **Apps and integrations > APIs > Zendesk API**.
2. Enable **Token access** if it isn't already.
3. Click **Add API token**, give it a label (e.g. `mastra-refund-agent`), and copy the token immediately - Zendesk only shows it once.
4. Note the email address of the agent/admin account this token is scoped to. Outbound calls authenticate as `{email}/token:{api_token}` (HTTP Basic), so this account's permissions determine what the adapter can do (post comments, change ticket status, etc).

You now have three of the four required values:

| Variable | Value |
| --- | --- |
| `ZENDESK_SUBDOMAIN` | The `{subdomain}` in `https://{subdomain}.zendesk.com` |
| `ZENDESK_EMAIL` | The email address the API token belongs to |
| `ZENDESK_API_TOKEN` | The token from step 3 |

## Step 2: Create the inbound webhook

Zendesk webhooks are a generic mechanism - you decide what triggers them and what JSON body they send. This template expects the shape documented in [`ZendeskWebhookPayload`](../src/mastra/integrations/zendesk-support.ts).

1. In Admin Center, go to **Apps and integrations > Webhooks > Webhooks** and click **Create webhook**.
2. Configure:
   - **Name**: something like `Mastra refund agent - inbound`.
   - **Endpoint URL**: `https://<your-deployed-host>/support/inbound`.
   - **Request method**: `POST`.
   - **Request format**: `JSON`.
   - **Authentication**: none required here - authenticity is instead verified via the webhook signing secret (step 3 below), which every Zendesk webhook has regardless of the authentication setting.
3. Save the webhook, then open it again and reveal the **Signing Secret** (click "Show"). Copy it - you'll need it as `ZENDESK_WEBHOOK_SECRET` in step 4.
4. Go to **Objects and rules > Business rules > Triggers** and create a new trigger:
   - **Name**: `Notify Mastra refund agent on new ticket`.
   - **Conditions**: `Meet ALL of the following conditions` -> `Ticket Is Created`.
   - **Actions**: `Notify active webhook` -> select the webhook from step 2. Set its JSON body to:

     ```json
     {
       "ticket": {
         "id": "{{ticket.id}}",
         "external_id": "{{ticket.external_id}}",
         "subject": "{{ticket.title}}",
         "description": "{{ticket.description}}",
         "requester": { "email": "{{ticket.requester.email}}", "name": "{{ticket.requester.name}}" },
         "created_at": "{{ticket.created_at}}",
         "updated_at": "{{ticket.updated_at}}"
       }
     }
     ```

   This is exactly the shape `normalizeInbound` expects. If you'd rather use different placeholders or add fields, that's fine as long as the result still resolves to a `ZendeskWebhookPayload` (`ticket.id` and `ticket.requester.email` are the only two hard requirements).

> **Note on placeholder suppression**: Zendesk suppresses some placeholders in certain automated/spam-prevention scenarios (see [Understanding placeholder suppression rules](https://support.zendesk.com/hc/en-us/articles/4408886955162)). This mostly matters for `{{ticket.description}}` on tickets created in unusual ways; the common "customer emails support" path is unaffected.

## Step 3: Webhook signature verification (required)

`POST /support/inbound` can trigger real refunds through the resolution workflow, so it must not accept unauthenticated requests from arbitrary callers. This template verifies every Zendesk webhook request using the [signing secret Zendesk generates automatically for every webhook](https://developer.zendesk.com/documentation/webhooks/verifying/) - no extra Zendesk-side configuration beyond copying the secret is required.

Verification works like this (implemented in `verifyZendeskWebhookSignature` in [`src/mastra/integrations/zendesk-support.ts`](../src/mastra/integrations/zendesk-support.ts) and wired into the route in [`src/mastra/server/routes.ts`](../src/mastra/server/routes.ts)):

1. Zendesk sends `X-Zendesk-Webhook-Signature` and `X-Zendesk-Webhook-Signature-Timestamp` headers with every request.
2. The route reads the **raw** request body (`c.req.text()`, not `c.req.json()` - this matters, because re-serializing a parsed JSON body will not byte-for-byte match what Zendesk signed).
3. It recomputes `base64(HMAC-SHA256(ZENDESK_WEBHOOK_SECRET, timestamp + rawBody))` and compares it to the header value using a constant-time comparison (`crypto.timingSafeEqual`).
4. If the signature is missing, malformed, or doesn't match, the route returns `401` and never touches the workflow.

This is why `ZENDESK_WEBHOOK_SECRET` is a **required** environment variable when `SUPPORT_SOURCE=zendesk` (the server throws a clear error at request time if it's missing, rather than silently accepting unverified webhooks). Copy the value from the webhook's "Signing Secret" field in Admin Center (step 2.3 above) into `ZENDESK_WEBHOOK_SECRET`.

If you ever reset the signing secret in Zendesk, update `ZENDESK_WEBHOOK_SECRET` in your deployment at the same time - requests will start failing verification otherwise.

## Step 4: Configure environment variables

Copy `.env.example` to `.env` (or set these in your hosting provider's environment/secrets manager) and fill in:

```bash
OPENAI_API_KEY=sk-...

SUPPORT_SOURCE=zendesk

ZENDESK_SUBDOMAIN=your-subdomain
ZENDESK_EMAIL=agent@yourcompany.com
ZENDESK_API_TOKEN=your-api-token
ZENDESK_WEBHOOK_SECRET=your-webhook-signing-secret
```

Setting `SUPPORT_SOURCE=zendesk` is the single switch that points `ingestSupportCaseWorkflow` and `resolveSupportCaseWorkflow` at the Zendesk adapter instead of the mock adapter (see [`src/mastra/integrations/active-adapter.ts`](../src/mastra/integrations/active-adapter.ts)).

## Step 5: Provision a persistent database

Both Mastra's own storage (`src/mastra/index.ts`) and this template's case store (`src/mastra/lib/case-store.ts`) use `@mastra/libsql`/`@libsql/client` and fall back to a local `file:./mastra.db` file when `TURSO_DATABASE_URL` isn't set. That file only works for local development - it lives on whatever disk the process happens to run on, so a real deployment needs a real libSQL database (Turso) instead.

If you're deploying to Mastra platform (Step 6), the easiest path is to let the CLI provision one for you:

```bash
mastra env db create --kind turso
```

This attaches a managed Turso database to the target environment and injects `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` into it automatically - you don't need to copy those values into your own env file. If you're deploying elsewhere (your own server, another cloud provider), create a Turso database yourself (`turso db create`, or via [turso.tech](https://turso.tech)) and set `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` in that platform's environment configuration.

## Step 6: Deploy

Zendesk needs to reach `POST /support/inbound` over HTTPS, so the app needs a public URL. This template's `package.json` scripts are Mastra CLI wrappers (`dev` -> `mastra dev`, `build` -> `mastra build`, `start` -> `mastra start`), so use the Mastra CLI directly for deployment:

```bash
mastra deploy
```

This builds the project, uploads it to [Mastra platform](https://mastra.ai/docs/mastra-platform/server), and gives you a stable HTTPS URL - use that URL as the webhook's Endpoint URL in Step 2. On first run it prompts you to log in and creates a `.mastra-project.json` linking this directory to the platform project; commit that file so subsequent deploys and CI/CD target the same project.

Environment variables from `.env`/`.env.local`/`.env.production` are uploaded automatically on first deploy to seed the project; after that, manage them with `mastra env list` / the platform dashboard, or by re-running `mastra deploy --env-file <file>`. Set all of `OPENAI_API_KEY`, `SUPPORT_SOURCE=zendesk`, `ZENDESK_SUBDOMAIN`, `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN`, and `ZENDESK_WEBHOOK_SECRET` (Steps 1-4) before deploying, or `mastra deploy`'s preflight check will block the deploy with `MISSING_ENV_VAR`.

If you'd rather run your own server (a VM, container, or another PaaS) instead of Mastra platform, run `mastra build` then `mastra start` (or `node .mastra/output/index.mjs`) and set the same environment variables - including `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` from Step 5 - in that platform's configuration. See the [Mastra server deployment guide](https://mastra.ai/docs/deployment/mastra-server) for details.

Whichever target you choose, make sure the deployed URL is stable, or update the Zendesk webhook's Endpoint URL if it changes.

## Local development with a tunnel

To test the Zendesk integration without deploying, expose your local dev server with a tunnel (e.g. [ngrok](https://ngrok.com), [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), or similar):

```bash
bun run dev            # starts the Mastra app on :4111
ngrok http 4111         # in a second terminal
```

Use the `https://*.ngrok.app` URL ngrok prints as the webhook's Endpoint URL in Step 2. Remember that most tunnel providers issue a new URL on every restart unless you're on a paid plan with reserved domains - update the Zendesk webhook accordingly.

## Testing the integration end to end

1. With the webhook and trigger configured and the server running (deployed or tunneled), submit a real ticket in Zendesk (as an end user, or via **Add ticket** in the agent interface) that mentions a scenario your fixture data covers - e.g. reference one of the mock order IDs in `src/mastra/lib/mock-commerce.ts`, or update that file with real-looking data of your own first.
2. Confirm the request lands: check your server logs for the `/support/inbound` request, or watch **Admin Center > Apps and integrations > Webhooks > select the webhook > Recent requests** for the delivery attempt and response code.
   - A `401` here almost always means `ZENDESK_WEBHOOK_SECRET` doesn't match the webhook's current signing secret.
3. Open [Mastra Studio](http://localhost:4111) (or your deployed app's `/support/cases` route, or the demo UI in `web/`) to watch the case move through triage, policy retrieval, order lookup, and drafting.
4. If the draft recommends a refund, the case will show `status: "waiting_approval"`. Approve or reject it via `POST /support/cases/:caseId/approve` or `.../reject` (or from the admin UI in `web/`).
5. Confirm Zendesk received the outcome: the ticket should have a new public comment with the final response, and (for escalations) an internal note explaining why, plus an updated status (`solved`, `pending`, or `open` depending on the outcome - see `toZendeskStatus` in the adapter).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Webhook shows `401` in Zendesk's "Recent requests" | `ZENDESK_WEBHOOK_SECRET` is missing/incorrect, or the webhook's signing secret was reset without updating the deployed env var. |
| Webhook shows `400 Invalid Zendesk webhook payload` | The trigger's JSON body doesn't include `ticket.id` or `ticket.requester.email` - check the trigger action's JSON body against Step 2. |
| `ZENDESK_SUBDOMAIN is not set.` / `ZENDESK_EMAIL and ZENDESK_API_TOKEN must both be set...` errors in server logs | One or more required env vars are missing in the deployed environment - re-check Step 4. |
| `mastra deploy` blocked with `LOCAL_STORAGE_PATH` | `TURSO_DATABASE_URL` isn't set in the environment being deployed, so storage would fall back to a host-local `file:./mastra.db` - run `mastra env db create --kind turso` (Step 5) or set `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` yourself. |
| `mastra deploy` blocked with `MISSING_ENV_VAR` | The env file being deployed is missing one of the vars from Step 4 - add it to `.env`/`.env.production` (or the platform's stored env vars) before deploying. |
| Cases disappear or 404 after a redeploy | `TURSO_DATABASE_URL` isn't set, so the case store and Mastra storage silently fell back to the ephemeral local file - see Step 5. |
| Case never reaches the "waiting_approval"/resolved state | Check the server logs for `resolve-support-case run failed` - the ingest route starts resolution asynchronously (see `startResolutionStep` in `src/mastra/workflows/ingest-support-case.ts`) and failures are recorded on the case rather than surfaced to the webhook response. |
| Reply never appears on the Zendesk ticket | The sync-back call in `resolveSupportCaseWorkflow` is best-effort and only logs a warning on failure (so a Zendesk API hiccup doesn't fail an already-decided resolution) - check server logs for `Failed to sync case resolution back to source system`, and confirm the API token's account has permission to comment on and update the ticket. |

## Customizing further

- **Escalation routing**: `sendReply`/`addInternalNote`/`updateStatus` in the adapter are focused on this template's needs. If you want escalations to also set an assignee, group, or priority, extend `ZendeskSupportAdapter` with additional `updateTicket` calls.
- **Richer inbound data**: the current trigger JSON body only forwards the ticket's initial comment. If you need to react to follow-up replies (not just ticket creation), add a second trigger/webhook pair for `Ticket Is Updated` conditions and extend `normalizeInbound`/`ingestSupportCaseWorkflow`'s idempotency handling accordingly (`caseStore.findByExternalId` already dedupes by `source:externalId`, so re-normalizing the same ticket is safe).
- **Requests API vs Tickets API**: this adapter uses the [Tickets API](https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/), which is the agent's view of a ticket. If you need end-user-scoped behavior, see Zendesk's [Requests API](https://developer.zendesk.com/api-reference/ticketing/requests/requests/) instead.
