// Converts database rows (snake_case) into the camelCase shape the original
// Prisma-based pages expect, e.g. source_language -> sourceLanguage.
/* eslint-disable @typescript-eslint/no-explicit-any */
const toCamel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

export function camel<T = any>(value: any): T {
  if (Array.isArray(value)) return value.map((v) => camel(v)) as T;
  if (value && typeof value === "object" && value.constructor === Object) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[toCamel(k)] = camel(v);
    return out as T;
  }
  return value as T;
}
