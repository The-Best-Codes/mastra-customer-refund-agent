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
 * All three go through `PUT /api/v2/tickets/{ticket_id}` (see "Update Ticket" in the docs above):
 * a `comment.public: true` update posts a public reply, `comment.public: false` posts an internal
 * note, and `status` transitions the ticket. Auth is HTTP Basic with `{email}/token:{api_token}`
 * base64-encoded, exactly as shown in Zendesk's own code samples.
 *
 * ## Required environment variables
 *
 * - `ZENDESK_SUBDOMAIN` - the `{subdomain}` in `https://{subdomain}.zendesk.com`
 * - `ZENDESK_EMAIL` - the email address of the agent/admin the API token belongs to
 * - `ZENDESK_API_TOKEN` - an API token from Admin Center > Apps and integrations > APIs > Zendesk API
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

export class ZendeskSupportAdapter implements SupportSourceAdapter {
  source = 'zendesk' as const;

  private get subdomain(): string {
    const value = process.env.ZENDESK_SUBDOMAIN;
    if (!value) throw new Error('ZENDESK_SUBDOMAIN is not set.');
    return value;
  }

  private get authHeader(): string {
    const email = process.env.ZENDESK_EMAIL;
    const token = process.env.ZENDESK_API_TOKEN;
    if (!email || !token) {
      throw new Error('ZENDESK_EMAIL and ZENDESK_API_TOKEN must both be set to call the Zendesk API.');
    }
    return `Basic ${Buffer.from(`${email}/token:${token}`).toString('base64')}`;
  }

  private ticketUrl(ticketId: string): string {
    return `https://${this.subdomain}.zendesk.com/api/v2/tickets/${ticketId}`;
  }

  private async updateTicket(ticketId: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(this.ticketUrl(ticketId), {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: this.authHeader },
      body: JSON.stringify({ ticket: body }),
    });
    if (!response.ok) {
      throw new Error(`Zendesk ticket update failed (${response.status}): ${await response.text()}`);
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
