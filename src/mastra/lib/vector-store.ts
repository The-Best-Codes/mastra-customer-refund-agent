import { LibSQLVector } from '@mastra/libsql';

export const vectorStore = new LibSQLVector({
  id: 'support-vectors',
  url: 'file:./mastra.db',
});

export const KNOWLEDGE_INDEX = 'support_knowledge';
export const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const EMBEDDING_DIMENSION = 1536;
