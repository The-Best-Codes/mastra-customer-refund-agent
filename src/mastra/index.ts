import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';
import {
  MastraPlatformExporter,
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';
import { triageAgent } from './agents/triage-agent';
import { responseAgent } from './agents/response-agent';
import { supportSupervisorAgent } from './agents/support-supervisor';
import { ingestSupportCaseWorkflow } from './workflows/ingest-support-case';
import { resolveSupportCaseWorkflow } from './workflows/resolve-support-case';
import { indexSupportKnowledgeWorkflow } from './workflows/index-support-knowledge';
import { supportEvalScorerRegistry } from './evals';
import { vectorStore } from './lib/vector-store';
import { supportRoutes } from './server/routes';

export const mastra = new Mastra({
  agents: {
    triageAgent,
    responseAgent,
    supportSupervisorAgent,
  },
  workflows: {
    ingestSupportCaseWorkflow,
    resolveSupportCaseWorkflow,
    indexSupportKnowledgeWorkflow,
  },
  scorers: supportEvalScorerRegistry,
  vectors: {
    supportKnowledge: vectorStore,
  },
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: process.env.TURSO_DATABASE_URL || 'file:./mastra.db',
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  }),
  server: {
    apiRoutes: supportRoutes,
  },
  logger: new PinoLogger({ name: 'support-refund-agent', level: 'info' }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'support-refund-agent',
        exporters: [new MastraStorageExporter(), new MastraPlatformExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
