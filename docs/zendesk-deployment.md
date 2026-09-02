# Deploying with Zendesk

This guide shows how to connect this project to a real Zendesk Support instance and deploy it so Zendesk can send tickets into the workflow.

The integration code is in [`src/mastra/integrations/zendesk-support.ts`](../src/mastra/integrations/zendesk-support.ts).

At a high level:

1. Create a Zendesk OAuth client.
2. Put that client's credentials in this project's environment.
3. Create a Zendesk webhook that points at `POST /support/inbound`.
4. Create a Zendesk trigger that sends new tickets to that webhook.
5. Deploy the Mastra server to a public HTTPS URL.

This project uses [`node-zendesk`](https://github.com/blakmatrix/node-zendesk) for Zendesk API calls and mints OAuth access tokens server-side with the `client_credentials` grant. That means you do not need to copy short-lived access tokens into env vars by hand.

## Prerequisites

- A Zendesk account with admin access
- An `OPENAI_API_KEY`
- A public HTTPS URL for the deployed server
- A persistent libSQL database for production, usually Turso

## Step 1: Create a Zendesk OAuth client

Zendesk documents this under **Admin Center > Apps and integrations > APIs > OAuth clients**.

1. Open **Admin Center**.
2. In the left sidebar, click **Apps and integrations**.
3. Click **APIs**.
4. Click **OAuth clients**.
5. Click **Add OAuth client**.
6. Fill the form like this:
   - **Name**: `Mastra refund agent`
   - **Description**: optional
   - **Company**: optional
   - **Identifier**: keep the generated one or choose your own stable value
   - **Client kind**: `Confidential`
   - **Redirect URLs**: Zendesk requires at least one redirect URL on the client. This project does not use the browser-based authorization-code flow, so any valid placeholder URL you control is fine. Example: `https://example.com/zendesk/oauth/callback`
   - **Scopes**: `tickets:read tickets:write users:read`
   - **Expire tokens**: leave the default setting alone
7. Click **Save**.
8. After the page refreshes, copy these two values:
   - **Identifier**
   - **Secret**

Save them immediately. Zendesk only shows the full secret once.

## Step 2: Configure environment variables

Copy `.env.example` to `.env` locally, or set the same values in your hosting platform.

```bash
OPENAI_API_KEY=sk-...

SUPPORT_SOURCE=zendesk

ZENDESK_SUBDOMAIN=your-subdomain
ZENDESK_OAUTH_CLIENT_ID=your-oauth-client-identifier
ZENDESK_OAUTH_CLIENT_SECRET=your-oauth-client-secret
ZENDESK_OAUTH_SCOPE=tickets:read tickets:write users:read
ZENDESK_WEBHOOK_SECRET=your-webhook-signing-secret
```

For production, also set:

```bash
TURSO_DATABASE_URL=...
TURSO_AUTH_TOKEN=...
```

How the OAuth part works:

- The server exchanges `ZENDESK_OAUTH_CLIENT_ID` and `ZENDESK_OAUTH_CLIENT_SECRET` for an access token by calling `POST https://{subdomain}.zendesk.com/oauth/tokens` with `grant_type=client_credentials`
- The server caches the token in memory until it is close to expiry
- When the token expires, the server requests a new one automatically

You do not need to manage `ZENDESK_OAUTH_TOKEN` manually.

## Step 3: Create the inbound webhook

1. Open **Admin Center**.
2. In the left sidebar, click **Apps and integrations**.
3. Click **Webhooks**.
4. Click **Create webhook**.
5. Fill the webhook like this:
   - **Name**: `Mastra refund agent inbound`
   - **Endpoint URL**: `https://<your-host>/support/inbound`
   - **Request method**: `POST`
   - **Request format**: `JSON`
   - **Authentication**: none
6. Save the webhook.
7. Open the webhook again.
8. Reveal the **Signing Secret** and copy it.

Set that value as `ZENDESK_WEBHOOK_SECRET`.

## Step 4: Create the trigger that sends new tickets to Mastra

1. Open **Admin Center**.
2. In the left sidebar, click **Objects and rules**.
3. Click **Business rules**.
4. Click **Triggers**.
5. Click **Add trigger**.
6. Fill it like this:
   - **Name**: `Notify Mastra refund agent on new ticket`
7. Under **Conditions**, choose `Meet ALL of the following conditions` and add:
   - `Ticket` `Is` `Created`
8. Under **Actions**, add `Notify active webhook`.
9. Select the webhook from Step 3.
10. Use this JSON body:

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

This is the shape the adapter expects.

Required fields are:

- `ticket.id`
- `ticket.requester.email`

## Step 5: Provision a database for production

This project can use a local `file:./mastra.db` database during development, but production should use Turso/libSQL.

If you are deploying to the Mastra platform, provision a database with:

```bash
mastra env db create --kind turso
```

If you are deploying elsewhere, create a Turso database yourself and set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in that environment.

## Step 6: Run locally

Use the project scripts:

```bash
npm run dev
```

Mastra Studio is usually available at `http://localhost:4111`.

## Step 7: Test locally with a tunnel

Zendesk cannot call `localhost`, so expose your local server with a tunnel:

```bash
npm run dev
ngrok http 4111
```

Then update the webhook's **Endpoint URL** to the public `https://...` tunnel URL.

## Step 8: Deploy

Use the project scripts for the standard server flow:

```bash
npm run build
npm run start
```

Mastra builds a standalone server into `.mastra/output`, and `npm run start` runs it.

If you are deploying to the Mastra platform, run:

```bash
mastra deploy
```

Before deploying, make sure the target environment has all of these variables:

- `OPENAI_API_KEY`
- `SUPPORT_SOURCE=zendesk`
- `ZENDESK_SUBDOMAIN`
- `ZENDESK_OAUTH_CLIENT_ID`
- `ZENDESK_OAUTH_CLIENT_SECRET`
- `ZENDESK_OAUTH_SCOPE`
- `ZENDESK_WEBHOOK_SECRET`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

After deploy, the webhook endpoint should be:

```text
https://<your-deployed-host>/support/inbound
```

## Step 9: Verify the full flow

1. Create a real Zendesk ticket.
2. Check the webhook's recent deliveries in Zendesk.
3. Confirm the case appears in Mastra Studio or `GET /support/cases`.
4. Let the workflow run.
5. If it pauses for approval, approve or reject the case with `POST /support/cases/:caseId/approve` or `POST /support/cases/:caseId/reject`.
6. Confirm the Zendesk ticket receives the final reply and status update.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Webhook returns `401` | `ZENDESK_WEBHOOK_SECRET` is missing or incorrect |
| Webhook returns `400 Invalid Zendesk webhook payload` | The trigger JSON body does not include `ticket.id` or `ticket.requester.email` |
| Outbound Zendesk sync fails | `ZENDESK_OAUTH_CLIENT_ID` or `ZENDESK_OAUTH_CLIENT_SECRET` is wrong, or the OAuth client scopes are too narrow |
| Zendesk token request fails with scope errors | `ZENDESK_OAUTH_SCOPE` asks for scopes that are not allowed on the OAuth client |
| Deploy complains about local storage | Production is still falling back to `file:./mastra.db` |
| Cases disappear after redeploy | Production is not using `TURSO_DATABASE_URL` |

## Notes

- Zendesk documents webhook signing as optional, but this project rejects unsigned or invalid inbound webhook requests because the endpoint can start real refund workflows.
- The current integration handles ticket creation. If you want follow-up replies to re-enter the workflow, add another trigger for ticket updates and extend the normalization logic.
