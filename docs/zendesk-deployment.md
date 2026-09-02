# Deploying with Zendesk

This guide shows how to connect this project to a real Zendesk Support instance and deploy the Mastra server somewhere Zendesk can reach over HTTPS.

The integration lives in [`src/mastra/integrations/zendesk-support.ts`](../src/mastra/integrations/zendesk-support.ts). It implements the same `SupportSourceAdapter` interface as the mock adapter, so the workflows and agents do not change. You only switch `SUPPORT_SOURCE`, configure Zendesk, and deploy the server.

## What this integration does

- Accepts inbound Zendesk webhooks at `POST /support/inbound`
- Verifies webhook signatures with `ZENDESK_WEBHOOK_SECRET`
- Normalizes the incoming ticket into this app's support-case format
- Uses [`node-zendesk`](https://github.com/blakmatrix/node-zendesk) plus a Zendesk OAuth access token to:
  - post public replies
  - add internal notes
  - update ticket status

## Prerequisites

- A Zendesk account with admin access
- A public HTTPS URL for this Mastra app
- An OpenAI API key for the agent itself
- A persistent database for production, typically Turso/libSQL

Zendesk cannot call `localhost` directly, so for local testing you need a tunnel such as ngrok or Cloudflare Tunnel.

## Step 1: Create a Zendesk OAuth client and access token

Zendesk is moving away from API tokens, so this project now uses OAuth for outbound Zendesk API calls.

1. In Zendesk Admin Center, create an OAuth client for this app.
2. Set the redirect URL to something you control for the OAuth exchange flow.
3. Grant the client the scopes needed to read and update tickets.
4. Complete the OAuth flow and obtain an access token for the agent/admin account that should write replies and internal notes.

You need these values:

| Variable | Value |
| --- | --- |
| `ZENDESK_SUBDOMAIN` | The `{subdomain}` in `https://{subdomain}.zendesk.com` |
| `ZENDESK_OAUTH_TOKEN` | The OAuth access token used by `node-zendesk` |

The permissions on that OAuth token determine what the adapter can do in Zendesk.

## Step 2: Create the inbound webhook

In Zendesk, create a webhook that points to this app's ingestion endpoint.

1. In Admin Center, go to **Apps and integrations > Webhooks** and create a webhook.
2. Configure it like this:
   - **Endpoint URL**: `https://<your-host>/support/inbound`
   - **Method**: `POST`
   - **Format**: `JSON`
3. Save the webhook.
4. Re-open it and copy its **Signing Secret**. You will use that as `ZENDESK_WEBHOOK_SECRET`.

## Step 3: Create a Zendesk trigger for new tickets

This project expects a small JSON payload containing the ticket id, requester, and initial message.

1. In Zendesk Admin Center, go to **Objects and rules > Business rules > Triggers**.
2. Create a trigger for newly created tickets.
3. Add a **Notify active webhook** action using the webhook from Step 2.
4. Use this JSON body:

```json
{
  "ticket": {
    "id": "{{ticket.id}}",
    "external_id": "{{ticket.external_id}}",
    "subject": "{{ticket.title}}",
    "description": "{{ticket.description}}",
    "requester": {
      "email": "{{ticket.requester.email}}",
      "name": "{{ticket.requester.name}}"
    },
    "created_at": "{{ticket.created_at}}",
    "updated_at": "{{ticket.updated_at}}"
  }
}
```

This matches the `ZendeskWebhookPayload` shape accepted by `normalizeInbound`.

Minimum required fields:

- `ticket.id`
- `ticket.requester.email`

## Step 4: Configure environment variables

Copy `.env.example` to `.env` for local development, or set the same values in your deployment platform.

```bash
OPENAI_API_KEY=sk-...

SUPPORT_SOURCE=zendesk

ZENDESK_SUBDOMAIN=your-subdomain
ZENDESK_OAUTH_TOKEN=your-zendesk-oauth-access-token
ZENDESK_WEBHOOK_SECRET=your-webhook-signing-secret
```

For production, also set:

```bash
TURSO_DATABASE_URL=...
TURSO_AUTH_TOKEN=...
```

`SUPPORT_SOURCE=zendesk` is the switch that makes the workflows use the Zendesk adapter instead of the mock adapter.

## Step 5: Provision a persistent database

For local development, this project can fall back to `file:./mastra.db`. For real deployments, do not rely on that local file.

Use a real libSQL database instead.

If you are deploying to the Mastra platform, provision one with:

```bash
mastra env db create --kind turso
```

If you are deploying somewhere else, create a Turso database yourself and set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in that environment.

## Step 6: Run locally

Use the project scripts from `package.json`:

```bash
npm run dev
```

That starts the Mastra server locally. By default, Mastra runs on port `4111` unless your local configuration says otherwise.

Open:

- `http://localhost:4111` for Mastra Studio
- `http://localhost:4111/support/cases` for the case feed API

## Step 7: Expose the server to Zendesk during development

If you want to test before deploying, tunnel your local server:

```bash
npm run dev
ngrok http 4111
```

Then update the Zendesk webhook endpoint to the public `https://...` tunnel URL.

If the tunnel URL changes, update the webhook again.

## Step 8: Deploy the Mastra server

Mastra builds this project into a standalone server with `mastra build`, and runs it with `mastra start` or `node .mastra/output/index.mjs`.

For a normal deployment flow, use the project scripts:

```bash
npm run build
npm run start
```

If you are deploying to the Mastra platform, use the Mastra deploy command from the project root:

```bash
mastra deploy
```

Before deploying, make sure the target environment already has:

- `OPENAI_API_KEY`
- `SUPPORT_SOURCE=zendesk`
- `ZENDESK_SUBDOMAIN`
- `ZENDESK_OAUTH_TOKEN`
- `ZENDESK_WEBHOOK_SECRET`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

After deployment, set the Zendesk webhook endpoint to the deployed URL:

```text
https://<your-deployed-host>/support/inbound
```

## Step 9: Test the full flow

1. Create a real Zendesk ticket.
2. Confirm Zendesk shows a successful webhook delivery.
3. Confirm the case appears in `Mastra Studio` or via `GET /support/cases`.
4. Let the workflow run.
5. If the case pauses for approval, approve or reject it with:
   - `POST /support/cases/:caseId/approve`
   - `POST /support/cases/:caseId/reject`
6. Confirm Zendesk receives:
   - a public reply
   - an internal note when relevant
   - the expected ticket status change

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Webhook shows `401` in Zendesk | `ZENDESK_WEBHOOK_SECRET` is missing or wrong |
| Webhook shows `400 Invalid Zendesk webhook payload` | The trigger body is missing `ticket.id` or `ticket.requester.email` |
| Zendesk sync-back fails in server logs | `ZENDESK_OAUTH_TOKEN` is missing, expired, or lacks ticket permissions |
| Deploy complains about local storage | You are still relying on `file:./mastra.db` instead of Turso/libSQL |
| Cases vanish after redeploy | Production is still using local file storage instead of `TURSO_DATABASE_URL` |
| Reply never appears on the ticket | The OAuth token cannot update tickets, or the ticket sync call failed |

## Notes

- Webhook verification is still important even though Zendesk signs it as optional in their docs. In this project, `POST /support/inbound` can trigger refund decisions, so unsigned or invalid requests are rejected.
- The adapter currently handles new-ticket ingestion. If you want follow-up replies to re-enter the workflow, add another Zendesk trigger for ticket updates and extend the normalization/idempotency flow.
