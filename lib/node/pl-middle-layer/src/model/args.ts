import { assertNever } from "@milaboratories/ts-helpers";
import type { PlRef } from "@platforma-sdk/model";
import { peelJsonLayers } from "@milaboratories/pl-model-common";

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
      // A reference can be hiding inside a string under any number of `JSON.stringify`
      // passes, and this walk would otherwise never reach it. Peeling is shared with the
      // column-id remapper so that "how a value hides inside a string" has one
      // definition; what happens at the bottom is not shared, and here it is deliberately
      // broad — anything the peel produced is walked, including a foreign-schema document
      // that merely contains a reference. That breadth is what makes this detector usable
      // as a guard over carriers the template codec declines to touch.
      const peeled = peelJsonLayers(node as string);
      if (peeled !== undefined) addAllReferencedBlocks(result, peeled.value, allowed);
      return;
    }
    case "object": {
      if (node === null) return;
      if (isBlockOutputReference(node)) {
        recordRef(result, node.blockId, node.requireEnrichments === true, allowed);
      } else if (Array.isArray(node)) {
        for (const child of node) addAllReferencedBlocks(result, child, allowed);
      } else {
        // Keys as well as values: a discovered column's `queriesQualifications` is keyed BY
        // column id, so a map key can carry a block id — and dropping the key loses that
        // upstream edge entirely.
        for (const [key, child] of Object.entries(node as object)) {
          addAllReferencedBlocks(result, key, allowed);
          addAllReferencedBlocks(result, child, allowed);
        }
      }

      return;
    }
    default:
      assertNever(type);
  }
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
