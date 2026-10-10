import type { z } from 'zod';
import { badRequest } from '../errors.js';

/** Parses untrusted input with a zod schema, throwing a 400 with field-level details on failure. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  const first = result.error.issues[0];
  const message = first
    ? first.path.length
      ? `${first.path.join('.')}: ${first.message}`
      : first.message
    : 'Invalid input';
  throw badRequest(message, { fields });
}
