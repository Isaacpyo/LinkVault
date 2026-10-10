import type { FastifyInstance } from 'fastify';
import { loginSchema, registerSchema, type AuthResponse } from '@linkvault/shared';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../auth/passwords.js';
import { claims, requireAuth } from '../auth/plugin.js';
import { createDemoSandbox } from '../demo/demo.js';
import { AppError, conflict, DuplicateError, notFound, unauthorized } from '../errors.js';
import { toPublicUser } from '../lib/dto.js';
import { parse } from '../lib/validate.js';
import { newId } from '../store/ids.js';
import type { UserRecord } from '../store/types.js';
import type { RouteContext } from './context.js';

export function authRoutes(app: FastifyInstance, { store, tokens, config }: RouteContext) {
  app.post('/auth/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = parse(registerSchema, request.body);
    const user: UserRecord = {
      id: newId(),
      email: input.email,
      name: input.name ?? null,
      passwordHash: await hashPassword(input.password),
      isDemo: false,
      demoExpiresAt: null,
      createdAt: new Date().toISOString(),
    };
    try {
      await store.createUser(user);
    } catch (error) {
      if (error instanceof DuplicateError) throw conflict('An account with this email already exists');
      throw error;
    }
    const token = await tokens.sign({ sub: user.id, email: user.email, demo: false });
    reply.code(201);
    return { token, user: toPublicUser(user) } satisfies AuthResponse;
  });

  app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const input = parse(loginSchema, request.body);
    const user = await store.findUserByEmail(input.email);
    // Always run bcrypt so response time does not reveal whether the email exists.
    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid || user.isDemo) throw unauthorized('Incorrect email or password');
    const token = await tokens.sign({ sub: user.id, email: user.email, demo: false });
    return { token, user: toPublicUser(user) } satisfies AuthResponse;
  });

  app.post('/auth/demo', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (_request, reply) => {
    if (!config.demo.enabled) throw notFound('Demo');
    const user = await createDemoSandbox(store, config.demo.ttlHours);
    const expiresAt = user.demoExpiresAt ? new Date(user.demoExpiresAt) : undefined;
    const token = await tokens.sign({ sub: user.id, email: user.email, demo: true }, expiresAt);
    reply.code(201);
    return { token, user: toPublicUser(user) } satisfies AuthResponse;
  });

  app.register(async (scope) => {
    scope.addHook('onRequest', requireAuth(tokens));
    scope.get('/auth/me', async (request) => {
      const user = await store.getUser(claims(request).sub);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'This account no longer exists');
      return { user: toPublicUser(user) };
    });
  });
}
