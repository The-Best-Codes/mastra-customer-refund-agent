import type { SupportSourceAdapter } from './support-source';
import { mockSupportAdapter } from './mock-support';
import { zendeskSupportAdapter } from './zendesk-support';

export type SupportSourceKind = 'mock' | 'zendesk';

const adaptersByKind: Record<SupportSourceKind, SupportSourceAdapter> = {
  mock: mockSupportAdapter,
  zendesk: zendeskSupportAdapter,
};

/**
 * Picks the adapter this deployment talks to, based on `SUPPORT_SOURCE` (`mock` | `zendesk`,
 * defaults to `mock`). This is the one switch `ingestSupportCaseWorkflow` and
 * `resolveSupportCaseWorkflow` need to point the whole pipeline at a real provider - everything
 * downstream only ever sees a normalized `SupportCase`. See `zendesk-support.ts` for the required
 * environment variables and webhook setup.
 */
export function getActiveSupportAdapter(): SupportSourceAdapter {
  const kind = (process.env.SUPPORT_SOURCE?.trim().toLowerCase() || 'mock') as SupportSourceKind;
  const adapter = adaptersByKind[kind];
  if (!adapter) {
    throw new Error(
      `Unknown SUPPORT_SOURCE "${kind}". Expected one of: ${Object.keys(adaptersByKind).join(', ')}.`,
    );
  }
  return adapter;
}
