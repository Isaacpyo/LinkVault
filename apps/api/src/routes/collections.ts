import type { FastifyInstance } from 'fastify';
import { createCollectionSchema, updateCollectionSchema, type Collection } from '@linkvault/shared';
import { claims } from '../auth/plugin.js';
import { conflict, notFound } from '../errors.js';
import { toCollection } from '../lib/dto.js';
import { parse } from '../lib/validate.js';
import { newId } from '../store/ids.js';
import type { CollectionRecord } from '../store/types.js';
import type { RouteContext } from './context.js';

const idParam = (params: unknown) => (params as { id: string }).id;

/** Routes registered inside an authenticated scope. */
export function collectionRoutes(app: FastifyInstance, { store }: RouteContext) {
  const assertUniqueName = async (userId: string, name: string, exceptId?: string) => {
    const existing = await store.listCollections(userId);
    if (existing.some((c) => c.id !== exceptId && c.name.toLowerCase() === name.toLowerCase())) {
      throw conflict(`A collection named "${name}" already exists`);
    }
  };

  app.get('/collections', async (request): Promise<{ collections: Collection[] }> => {
    const { sub } = claims(request);
    const [collections, summary] = await Promise.all([store.listCollections(sub), store.summary(sub)]);
    return { collections: collections.map((c) => toCollection(c, summary.collectionCounts[c.id] ?? 0)) };
  });

  app.post('/collections', async (request, reply) => {
    const { sub } = claims(request);
    const input = parse(createCollectionSchema, request.body);
    await assertUniqueName(sub, input.name);
    const now = new Date().toISOString();
    const collection: CollectionRecord = {
      id: newId(),
      userId: sub,
      name: input.name,
      color: input.color ?? 'slate',
      createdAt: now,
      updatedAt: now,
    };
    await store.putCollection(collection);
    reply.code(201);
    return { collection: toCollection(collection, 0) };
  });

  app.patch('/collections/:id', async (request) => {
    const { sub } = claims(request);
    const input = parse(updateCollectionSchema, request.body);
    const existing = await store.getCollection(sub, idParam(request.params));
    if (!existing) throw notFound('Collection');
    if (input.name) await assertUniqueName(sub, input.name, existing.id);
    const updated: CollectionRecord = {
      ...existing,
      name: input.name ?? existing.name,
      color: input.color ?? existing.color,
      updatedAt: new Date().toISOString(),
    };
    await store.putCollection(updated);
    const summary = await store.summary(sub);
    return { collection: toCollection(updated, summary.collectionCounts[updated.id] ?? 0) };
  });

  app.delete('/collections/:id', async (request, reply) => {
    const { sub } = claims(request);
    const deleted = await store.deleteCollection(sub, idParam(request.params));
    if (!deleted) throw notFound('Collection');
    return reply.code(204).send();
  });
}
