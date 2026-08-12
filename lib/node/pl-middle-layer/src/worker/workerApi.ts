/* eslint-disable @typescript-eslint/require-await */
import { parseTemplate } from "@milaboratories/pl-model-backend";
import type { TemplateCodec } from "@milaboratories/pl-model-backend";

/**
 * Add there all heavy synchronous operations that can be moved to the worker thread.
 */
export const workerApi = {
  parseTemplate: async (payload: Uint8Array, codec: TemplateCodec) => {
    const t1 = performance.now();
    const result = parseTemplate(payload, codec);
    const t2 = performance.now();
    const dt = t2 - t1;
    if (dt > 100) console.warn(`parseTemplate in worker took ${dt}ms`);
    return result;
  },
} satisfies Record<string, (...args: any[]) => Promise<unknown>>;

type ToScheme<T extends Record<string, (...args: any[]) => any>> = {
  [K in keyof T]: {
    args: Parameters<T[K]>;
    response: Awaited<ReturnType<T[K]>>;
  };
};

export type Scheme = ToScheme<typeof workerApi>;
