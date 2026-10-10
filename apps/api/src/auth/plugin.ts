import type { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../errors.js';
import type { TokenClaims, TokenService } from './tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: TokenClaims | null;
  }
}

/** onRequest hook that requires a valid bearer token and attaches its claims to `request.auth`. */
export function requireAuth(tokens: TokenService) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const header = request.headers.authorization;
    const match = header?.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) throw unauthorized();
    request.auth = await tokens.verify(match[1]);
  };
}

/** Claims for a route behind `requireAuth`. */
export function claims(request: FastifyRequest): TokenClaims {
  if (!request.auth) throw unauthorized();
  return request.auth;
}
