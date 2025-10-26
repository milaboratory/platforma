import type { ZodObject, ZodRawShape } from 'zod';

/**
 * Passthrough without affecting type definitions.
 * @param schema - The schema to passthrough.
 * @returns The passthrough schema.
 */
export function schemaPassthrough<T extends ZodObject<ZodRawShape>>(schema: T): T {
  return schema.passthrough() as T;
}
