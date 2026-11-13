import type { BigIntStats } from "node:fs";
import fsp from "node:fs/promises";
import { createHash } from "node:crypto";
import * as v from "valibot";

export async function tryLoadFile<T>(
  file: string,
  map: (buf: Buffer) => T,
): Promise<T | undefined> {
  try {
    return map(await fsp.readFile(file));
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return undefined;
    else throw err;
  }
}

export async function tryStat(path: string): Promise<BigIntStats | undefined> {
  try {
    return await fsp.stat(path, { bigint: true });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export function calculateSha256(bytes: Uint8Array<ArrayBufferLike> | ArrayBuffer): Promise<string> {
  return Promise.resolve(
    createHash("sha256")
      .update(ArrayBuffer.isView(bytes) ? bytes : Buffer.from(bytes))
      .digest("hex")
      .toUpperCase(),
  );
}

/** Parses `value` with `schema`; on failure throws an error that lists every issue with its path. */
export function parseSchema<Schema extends v.GenericSchema>(
  schema: Schema,
  value: unknown,
): v.InferOutput<Schema> {
  const result = v.safeParse(schema, value);
  if (!result.success) {
    throw new Error(v.summarize(result.issues), { cause: new v.ValiError(result.issues) });
  }
  return result.output;
}
