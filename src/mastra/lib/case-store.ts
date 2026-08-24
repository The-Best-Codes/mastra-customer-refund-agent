import type { SupportCase } from '../domain/support-case';

/**
 * In-memory case store, keyed by case id with a secondary index on
 * `source:externalId` for webhook idempotency.
 *
 * This keeps the template dependency-free and easy to read. Case history
 * that must survive restarts (conversation threads, workflow suspend/resume
 * snapshots, refund audit trail) already lives in the Mastra storage
 * provider configured in `src/mastra/index.ts`. Swap this for a real table
 * (e.g. a `support_cases` table in the same Postgres/LibSQL database) before
 * shipping this template to production.
 */
class CaseStore {
  private casesById = new Map<string, SupportCase>();
  private idByExternalKey = new Map<string, string>();

  private externalKey(source: string, externalId: string): string {
    return `${source}:${externalId}`;
  }

  findByExternalId(source: string, externalId: string): SupportCase | undefined {
    const id = this.idByExternalKey.get(this.externalKey(source, externalId));
    return id ? this.casesById.get(id) : undefined;
  }

  create(supportCase: SupportCase): SupportCase {
    this.casesById.set(supportCase.id, supportCase);
    this.idByExternalKey.set(this.externalKey(supportCase.source, supportCase.externalId), supportCase.id);
    return supportCase;
  }

  get(id: string): SupportCase | undefined {
    return this.casesById.get(id);
  }

  update(id: string, patch: Partial<SupportCase>): SupportCase {
    const existing = this.casesById.get(id);
    if (!existing) {
      throw new Error(`Support case not found: ${id}`);
    }
    const updated: SupportCase = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.casesById.set(id, updated);
    return updated;
  }

  appendMessage(id: string, message: SupportCase['messages'][number]): SupportCase {
    const existing = this.casesById.get(id);
    if (!existing) {
      throw new Error(`Support case not found: ${id}`);
    }
    return this.update(id, { messages: [...existing.messages, message] });
  }

  list(): SupportCase[] {
    return [...this.casesById.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}

export const caseStore = new CaseStore();
