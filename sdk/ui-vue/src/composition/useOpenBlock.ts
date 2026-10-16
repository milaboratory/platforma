import {
  getRawPlatformaInstance,
  unwrapResult,
  type PlatformaV1,
  type PlatformaV2,
  type PlatformaV3,
} from "@platforma-sdk/model";

/**
 * Opens another block of the same project in the app, by block id. `undefined` when the app
 * cannot open blocks on a block's request — app versions released before it could, and pages
 * running outside the app — so a way to open a block is offered only when this is defined.
 */
export function useOpenBlock(): undefined | ((blockId: string) => Promise<void>) {
  return hostOpenBlock(findHost());
}

/** The part of the host API that opens blocks. */
export type OpenBlockHost =
  | Pick<PlatformaV3, "apiVersion" | "openBlock">
  | Pick<PlatformaV1 | PlatformaV2, "apiVersion">;

/** Opening a block through `host`; `undefined` when there is no host or it cannot open blocks. */
export function hostOpenBlock(
  host: undefined | OpenBlockHost,
): undefined | ((blockId: string) => Promise<void>) {
  if (host === undefined || host.apiVersion !== 3) return undefined;
  const openBlock = host.openBlock?.bind(host);
  if (openBlock === undefined) return undefined;
  return async (blockId) => unwrapResult(await openBlock(blockId));
}

// Internals

function findHost(): undefined | OpenBlockHost {
  try {
    return getRawPlatformaInstance();
  } catch {
    return undefined;
  }
}
