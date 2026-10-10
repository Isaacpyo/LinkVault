import { jwtVerify, SignJWT, errors as joseErrors } from 'jose';
import { unauthorized } from '../errors.js';

export interface TokenClaims {
  /** User id. */
  sub: string;
  email: string;
  demo: boolean;
}

const ISSUER = 'linkvault-api';
const AUDIENCE = 'linkvault';

export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttl: string,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  /** Signs a session token. Demo tokens expire with their sandbox instead of after the default TTL. */
  async sign(claims: TokenClaims, expiresAt?: Date): Promise<string> {
    return new SignJWT({ email: claims.email, demo: claims.demo })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(expiresAt ?? this.ttl)
      .sign(this.key);
  }

  async verify(token: string): Promise<TokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') throw unauthorized('Invalid session');
      return { sub: payload.sub, email: payload.email, demo: payload.demo === true };
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired) throw unauthorized('Your session has expired. Sign in again.');
      if (error instanceof joseErrors.JOSEError) throw unauthorized('Invalid session');
      throw error;
    }
  }
}
