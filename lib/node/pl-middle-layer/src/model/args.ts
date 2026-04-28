import { assertNever } from "@milaboratories/ts-helpers";
import type { PlRef } from "@platforma-sdk/model";

export function outputRef(blockId: string, name: string, requireEnrichments?: boolean): PlRef {
  if (requireEnrichments) return { __isRef: true, blockId, name, requireEnrichments };
  else return { __isRef: true, blockId, name };
}

export function isBlockOutputReference(obj: unknown): obj is PlRef {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "__isRef" in obj &&
    obj.__isRef === true &&
    "blockId" in obj &&
    "name" in obj
  );
}

export interface BlockUpstreams {
  /** All direct block dependencies */
  upstreams: Set<string>;
  /** Direct block dependencies which enrichments are also required by current block */
  upstreamsRequiringEnrichments: Set<string>;
  /** True if not-allowed references was encountered */
  missingReferences: boolean;
}

/** Extracts all resource ids referenced by args object. */
export function inferAllReferencedBlocks(args: unknown, allowed?: Set<string>): BlockUpstreams {
  const result = {
    upstreams: new Set<string>(),
    upstreamsRequiringEnrichments: new Set<string>(),
    missingReferences: false,
  };
  addAllReferencedBlocks(result, args, allowed);
  return result;
}

function addAllReferencedBlocks(result: BlockUpstreams, node: unknown, allowed?: Set<string>) {
  const type = typeof node;
  switch (type) {
    case "function":
    case "bigint":
    case "number":
    case "boolean":
    case "symbol":
    case "undefined":
      return;
    case "string": {
      unwrapEmbeddedRef(node as string, (parsed) =>
        addAllReferencedBlocks(result, parsed, allowed),
      );
      return;
    }
    case "object": {
      if (node === null) return;
      if (isBlockOutputReference(node)) {
        recordRef(result, node.blockId, node.requireEnrichments === true, allowed);
      } else if (Array.isArray(node)) {
        for (const child of node) addAllReferencedBlocks(result, child, allowed);
      } else {
        for (const [, child] of Object.entries(node as object))
          addAllReferencedBlocks(result, child, allowed);
      }

      return;
    }
    default:
      assertNever(type);
  }
}

/**
 * Detect a PlRef carried inside a string and hand the decoded value to `onParsed`.
 *
 * A PlRef-as-string is canonical `{...}` optionally wrapped by N `JSON.stringify`
 * passes. Each pass adds a symmetric prefix/suffix made only of `"` and `\`
 * chars (the escape padding) of equal length. The regex below is the strict
 * shape gate — non-ref strings fail at the very first character, so we never
 * scan their body. One pass is peeled per call; deeper nesting is unwrapped
 * via recursion in the caller.
 */
const EMBEDDED_REF_RE = /^(?<pre>[\\"]*)\{[\s\S]*?__isRef[\s\S]*\}(?<suf>[\\"]*)$/;

function unwrapEmbeddedRef(s: string, onParsed: (value: unknown) => void) {
  const c0 = s.charCodeAt(0);
  if (c0 !== 0x7b /* { */ && c0 !== 0x22 /* " */) return;
  const m = EMBEDDED_REF_RE.exec(s);
  if (m === null) return;
  if (m.groups!.pre.length !== m.groups!.suf.length) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    return;
  }
  if (parsed !== s) onParsed(parsed);
}

function recordRef(
  result: BlockUpstreams,
  blockId: string,
  requireEnrichments: boolean,
  allowed?: Set<string>,
) {
  if (allowed === undefined || allowed.has(blockId)) {
    result.upstreams.add(blockId);
    if (requireEnrichments) result.upstreamsRequiringEnrichments.add(blockId);
  } else result.missingReferences = true;
}
