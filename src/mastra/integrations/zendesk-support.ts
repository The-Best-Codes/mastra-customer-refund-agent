import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from 'node-zendesk';
import type { CaseMessage, SupportCase } from '../domain/support-case';
import type { SupportSourceAdapter } from './support-source';

/**
 * Zendesk Support (Ticketing API) adapter.
 *
 * Docs used to build this: https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/
 *
 * ## Wiring up the webhook (inbound)
 *
 * Zendesk doesn't have a single fixed "new ticket" webhook payload - you build the JSON body
 * yourself in a Trigger action. In Zendesk Admin Center, create a webhook pointing at
 * `POST https://<your-host>/support/inbound` (Admin Center > Apps and integrations > Webhooks),
 * then add a Trigger ("Ticket is Created") with a "Notify active webhook" action whose JSON body
 * is roughly:
 *
 * ```json
 * {
 *   "ticket": {
 *     "id": "{{ticket.id}}",
 *     "external_id": "{{ticket.external_id}}",
 *     "subject": "{{ticket.title}}",
 *     "description": "{{ticket.description}}",
 *     "requester": { "email": "{{ticket.requester.email}}", "name": "{{ticket.requester.name}}" },
 *     "created_at": "{{ticket.created_at}}",
 *     "updated_at": "{{ticket.updated_at}}"
 *   }
 * }
 * ```
 *
 * `normalizeInbound` below accepts exactly this shape. Adjust the placeholders/fields to taste -
 * as long as they still resolve to a `ZendeskWebhookPayload`, nothing downstream needs to change.
 *
 * ## Outbound calls (reply / internal note / status)
 *
 * All three go through the Tickets API via `node-zendesk`. A `comment.public: true` update posts a
 * public reply, `comment.public: false` posts an internal note, and `status` transitions the ticket.
 * Auth uses a Zendesk OAuth access token (`Authorization: Bearer ...`) rather than the legacy API
 * token flow.
 *
 * ## Required environment variables
 *
 * - `ZENDESK_SUBDOMAIN` - the `{subdomain}` in `https://{subdomain}.zendesk.com`
 * - `ZENDESK_OAUTH_TOKEN` - a Zendesk OAuth access token with ticket read/write scopes
 * - `ZENDESK_WEBHOOK_SECRET` - the webhook's "Signing Secret" (Admin Center > Apps and
 *   integrations > Webhooks > select the webhook > "Signing Secret" > "Show"). Required: without
 *   it, `/support/inbound` would accept unauthenticated POSTs from anyone who finds the URL, which
 *   is unacceptable for an endpoint that can trigger refunds. See `verifyZendeskWebhookSignature`.
 *
 * ## Verifying the webhook is genuinely from Zendesk
 *
 * `verifyZendeskWebhookSignature` re-derives the `X-Zendesk-Webhook-Signature` header from the
 * raw request body and the `X-Zendesk-Webhook-Signature-Timestamp` header, using
 * `ZENDESK_WEBHOOK_SECRET`, and compares them in constant time - exactly as described in
 * https://developer.zendesk.com/documentation/webhooks/verifying/. `supportInboundRoute`
 * (`src/mastra/server/routes.ts`) calls this before handing the payload to `normalizeInbound`, and
 * rejects the request with 401 if it doesn't match.
 */
export interface ZendeskWebhookPayload {
  ticket: {
    id: number | string;
    external_id?: string | null;
    subject?: string | null;
    description?: string | null;
    requester: { email: string; name?: string };
    created_at?: string;
    updated_at?: string;
  };
}

/** Zendesk's ticket status enum (see the `status` property in the Tickets JSON format docs). */
export type ZendeskTicketStatus = 'new' | 'open' | 'pending' | 'hold' | 'solved' | 'closed';

function messageFromPayload(payload: ZendeskWebhookPayload): CaseMessage {
  const ticket = payload.ticket;
  return {
    id: `msg_${crypto.randomUUID().slice(0, 8)}`,
    author: 'customer',
    authorName: ticket.requester.name ?? ticket.requester.email,
    body: ticket.description ?? '',
    createdAt: ticket.created_at ?? new Date().toISOString(),
  };
}

/** Maps this template's generic case status onto a Zendesk ticket status. */
function toZendeskStatus(status: string): ZendeskTicketStatus {
  switch (status) {
    case 'resolved':
      return 'solved';
    case 'waiting_approval':
      return 'pending';
    case 'escalated':
    case 'processing':
      return 'open';
    case 'new':
      return 'new';
    default:
      return 'open';
  }
}

/**
 * Verifies the `X-Zendesk-Webhook-Signature` / `X-Zendesk-Webhook-Signature-Timestamp` headers
 * against the raw request body, per https://developer.zendesk.com/documentation/webhooks/verifying/:
 * `base64(HMAC-SHA256(secret, timestamp + body))`.
 *
 * `rawBody` must be the exact bytes Zendesk sent (before JSON parsing) - re-serializing a parsed
 * body will not reproduce a matching signature.
 */
export function verifyZendeskWebhookSignature(params: {
  signature: string | undefined | null;
  timestamp: string | undefined | null;
  rawBody: string;
  secret: string;
}): boolean {
  const { signature, timestamp, rawBody, secret } = params;
  if (!signature || !timestamp) return false;

  const expected = createHmac('sha256', secret).update(timestamp + rawBody).digest('base64');

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export class ZendeskSupportAdapter implements SupportSourceAdapter {
  source = 'zendesk' as const;

  private get subdomain(): string {
    const value = process.env.ZENDESK_SUBDOMAIN;
    if (!value) throw new Error('ZENDESK_SUBDOMAIN is not set.');
    return value;
  }

  private get oauthToken(): string {
    const token = process.env.ZENDESK_OAUTH_TOKEN;
    if (!token) {
      throw new Error('ZENDESK_OAUTH_TOKEN must be set to call the Zendesk API.');
    }
    return token;
  }

  /** The webhook signing secret. Required - see the module docs above for why. */
  get webhookSecret(): string {
    const value = process.env.ZENDESK_WEBHOOK_SECRET;
    if (!value) {
      throw new Error(
        'ZENDESK_WEBHOOK_SECRET is not set. This is required when SUPPORT_SOURCE=zendesk so /support/inbound ' +
          'can verify requests actually came from Zendesk. Set it to the webhook\'s Signing Secret (Admin Center ' +
          '> Apps and integrations > Webhooks > select the webhook > Signing Secret > Show).',
      );
    }
    return value;
  }

  private get client() {
    return createClient({
      subdomain: this.subdomain,
      token: this.oauthToken,
      oauth: true,
    });
  }

  private async updateTicket(ticketId: string, body: Record<string, unknown>): Promise<void> {
    const numericTicketId = Number(ticketId);
    if (!Number.isInteger(numericTicketId)) {
      throw new Error(`Zendesk ticket id must be numeric. Received: ${ticketId}`);
    }

    try {
      await this.client.tickets.update(numericTicketId, body);
    } catch (error) {
      throw new Error(`Zendesk ticket update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async normalizeInbound(rawPayload: unknown) {
    const payload = rawPayload as ZendeskWebhookPayload;
    if (!payload?.ticket?.id || !payload.ticket.requester?.email) {
      throw new Error('Invalid Zendesk webhook payload: ticket.id and ticket.requester.email are required.');
    }

    const ticket = payload.ticket;
    const message = messageFromPayload(payload);

    return {
      externalId: String(ticket.external_id ?? ticket.id),
      source: this.source,
      customer: {
        email: ticket.requester.email,
        name: ticket.requester.name,
      },
      subject: ticket.subject || '(no subject)',
      messages: [message],
      createdAt: ticket.created_at ?? message.createdAt,
      updatedAt: ticket.updated_at ?? message.createdAt,
      metadata: { zendeskTicketId: ticket.id, rawPayload: payload },
    } satisfies Omit<SupportCase, 'id' | 'status' | 'metadata'> & { metadata: Record<string, unknown> };
  }

  /** `caseId` here is the Zendesk ticket id (see `metadata.zendeskTicketId` / `externalId`). */
  async sendReply(caseId: string, body: string): Promise<void> {
    await this.updateTicket(caseId, { comment: { body, public: true } });
  }

  async addInternalNote(caseId: string, body: string): Promise<void> {
    await this.updateTicket(caseId, { comment: { body, public: false } });
  }

  async updateStatus(caseId: string, status: string): Promise<void> {
    await this.updateTicket(caseId, { status: toZendeskStatus(status) });
  }
}

export const zendeskSupportAdapter = new ZendeskSupportAdapter();
