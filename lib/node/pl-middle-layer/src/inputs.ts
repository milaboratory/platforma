import { assertNever } from '@milaboratory/ts-helpers';

export interface BlockOutputReference {
  /** Marker of reference. Used to extract all references from block input. */
  __isRef: true;
  /** Referenced block id */
  block: string;
  /** Referenced output name in the block */
  output: string;
}

export function isBlockOutputReference(obj: any): obj is BlockOutputReference {
  // noinspection PointlessBooleanExpressionJS
  return typeof obj === 'object' && obj.__isRef === true && 'block' in obj && 'output' in obj;
}

function addAllReferencedBlocks(result: BlockUpstreams, node: any, allowed?: Set<string>) {
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
      if (isBlockOutputReference(node)) {
        if (allowed === undefined || allowed.has(node.block))
          result.upstreams.add(node.block);
        else
          result.missingReferences = true;

      } else if (Array.isArray(node)) {
        for (const child of node)
          addAllReferencedBlocks(result, child, allowed);

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
  /** Direct block dependencies */
  upstreams: Set<string>;
  /** True if not-allowed references was encountered */
  missingReferences: boolean;
}

/** Extracts all resource ids referenced by input object. */
export function inferAllReferencedBlocks(input: any, allowed?: Set<string>): BlockUpstreams {
  const result = { upstreams: new Set<string>(), missingReferences: false };
  addAllReferencedBlocks(result, input, allowed);
  return result;
}
