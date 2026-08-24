import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { MDocument } from '@mastra/rag';
import { z } from 'zod';
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL, KNOWLEDGE_INDEX, vectorStore } from '../lib/vector-store';

const knowledgeDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'knowledge');

const loadDocsStep = createStep({
  id: 'load-knowledge-docs',
  description: 'Read every Markdown policy document out of src/mastra/knowledge.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    docs: z.array(z.object({ title: z.string(), source: z.string(), text: z.string() })),
  }),
  execute: async () => {
    const files = (await readdir(knowledgeDir)).filter(f => f.endsWith('.md'));
    const docs = await Promise.all(
      files.map(async file => {
        const text = await readFile(path.join(knowledgeDir, file), 'utf-8');
        const title = text.match(/^#\s+(.+)$/m)?.[1] ?? file;
        return { title, source: file, text };
      }),
    );
    return { docs };
  },
});

const chunkAndEmbedStep = createStep({
  id: 'chunk-and-embed-docs',
  description: 'Chunk each document and embed the chunks with the Gateway embedding model.',
  inputSchema: z.object({
    docs: z.array(z.object({ title: z.string(), source: z.string(), text: z.string() })),
  }),
  outputSchema: z.object({ indexed: z.number() }),
  execute: async ({ inputData }) => {
    const indexes = await vectorStore.listIndexes();
    if (indexes.includes(KNOWLEDGE_INDEX)) {
      await vectorStore.deleteIndex({ indexName: KNOWLEDGE_INDEX });
    }
    await vectorStore.createIndex({ indexName: KNOWLEDGE_INDEX, dimension: EMBEDDING_DIMENSION, metric: 'cosine' });

    const chunks: Array<{ text: string; metadata: Record<string, unknown> }> = [];
    for (const doc of inputData.docs) {
      const mdoc = MDocument.fromText(doc.text, { title: doc.title, source: doc.source });
      const docChunks = await mdoc.chunk({ strategy: 'recursive', maxSize: 512, overlap: 50 });
      for (const chunk of docChunks) {
        chunks.push({
          text: String(chunk.text),
          metadata: { title: doc.title, source: doc.source, text: String(chunk.text) },
        });
      }
    }

    if (chunks.length === 0) return { indexed: 0 };

    const embeddingModel = new ModelRouterEmbeddingModel(EMBEDDING_MODEL);
    const { embeddings } = await embeddingModel.doEmbed({ values: chunks.map(c => c.text) });

    await vectorStore.upsert({
      indexName: KNOWLEDGE_INDEX,
      vectors: embeddings,
      metadata: chunks.map(c => c.metadata),
    });

    return { indexed: chunks.length };
  },
});

export const indexSupportKnowledgeWorkflow = createWorkflow({
  id: 'index-support-knowledge',
  description: 'Chunks and embeds the local refund/shipping/subscription/escalation policy docs into the vector store.',
  inputSchema: z.object({}),
  outputSchema: z.object({ indexed: z.number() }),
})
  .then(loadDocsStep)
  .then(chunkAndEmbedStep)
  .commit();
