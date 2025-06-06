import { assertNever } from '@milaboratories/ts-helpers';
import type { PlRef } from '@platforma-sdk/model';

export function outputRef(blockId: string, name: string, requireEnrichments?: boolean): PlRef {
  if (requireEnrichments) return { __isRef: true, blockId, name, requireEnrichments };
  else return { __isRef: true, blockId, name };
}

export function isBlockOutputReference(obj: unknown): obj is PlRef {
  return (
    typeof obj === 'object'
    && obj !== null
    && '__isRef' in obj
    && obj.__isRef === true
    && 'blockId' in obj
    && 'name' in obj
  );
}

function addAllReferencedBlocks(result: BlockUpstreams, node: unknown, allowed?: Set<string>) {
  const type = typeof node;
  switch (type) {
    case 'function':
    case 'bigint':
    case 'number':
    case 'string':
    case 'boolean':
    case 'symbol':
    case 'undefined':
      return;

    case 'object':
      if (node === null) return;

      if (isBlockOutputReference(node)) {
        if (allowed === undefined || allowed.has(node.blockId)) {
          result.upstreams.add(node.blockId);
          if (node.requireEnrichments)
            result.upstreamsRequiringEnrichments.add(node.blockId);
        } else result.missingReferences = true;
      } else if (Array.isArray(node)) {
        for (const child of node) addAllReferencedBlocks(result, child, allowed);
      } else {
        for (const [, child] of Object.entries(node as object))
          addAllReferencedBlocks(result, child, allowed);
      }

      return;

    default:
      assertNever(type);
  }
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
  const result = { upstreams: new Set<string>(), upstreamsRequiringEnrichments: new Set<string>(), missingReferences: false };
  addAllReferencedBlocks(result, args, allowed);
  return result;
}
