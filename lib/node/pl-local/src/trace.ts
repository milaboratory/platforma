import { MiLogger } from '@milaboratories/ts-helpers';

/** Records all inputs and outputs of one's choice, so if the error happened
 * one can check how it was by just printing this structure. */
export type Trace = Record<string, any>;

export function newTrace(): Trace {
  return {};
}

export function trace(t: Trace, k: string, v: any) {
  t[k] = v;
  return v;
}

/** Creates a trace and runs a function with it. The function can record all its
 * logs or traces using `trace` fn. */
export async function withTrace<T>(
  logger: MiLogger,
  fn: (trace: (k: string, v: any) => typeof v, t: Trace) => Promise<T>
): Promise<T> {
  const t = newTrace();
  try {
    const result = await fn((k: string, v: any) => trace(t, k, v), t);
    return result;
  } catch (e: any) {
    logger.error(`error ${e} while doing traced operation, state: ${JSON.stringify(t)}`);
    throw e;
  }
}
