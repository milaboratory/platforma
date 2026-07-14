import { createGlobalPObjectId, createLocalPObjectId } from "../pool";
import { ResourceTypeName } from "../resource_types";
import type { AccessorLike, LeafEntry, UpstreamBlockCtx } from "./types";

/** Resource types that hold column collections — DFS stops here and collects. */
export const COLLECT_TYPES: ReadonlyArray<string> = [ResourceTypeName.PFrame];

/** Resource types DFS descends through when looking for PFrames. */
export const DESCEND_TYPES: ReadonlyArray<string> = [
  ResourceTypeName.StdMap,
  ResourceTypeName.StdMapSlash,
];

/**
 * Enumerate column names backing a PFrame accessor — derived from
 * `<name>.spec` field names, without resolving the spec resources.
 */
export function listColumnNames<A extends AccessorLike<A>>(
  accessor: A,
  prefix: string = "",
): string[] {
  if (accessor.resourceType.name !== ResourceTypeName.PFrame) return [];
  const out: string[] = [];
  for (const field of accessor.listInputFields()) {
    if (!field.endsWith(".spec")) continue;
    const raw = field.slice(0, -".spec".length);
    if (!raw.startsWith(prefix)) continue;
    out.push(raw.slice(prefix.length));
  }
  return out;
}

/**
 * One DFS hit — the accessor whose resource-type matched `collectTypes`, and
 * the field-name path from the DFS root used to reach it.
 */
type DescendantHit<A extends AccessorLike<A>> = {
  readonly node: A;
  readonly path: ReadonlyArray<string>;
};

/**
 * DFS over the input-field subtree of `root`. Collects nodes whose resource
 * type ∈ `collectTypes`. Descends only through `descendTypes`
 * (default: StdMap / StdMapSlash). Collected nodes are not descended into.
 *
 * Threads the field-name path from `rootPath` to each hit, so callers can
 * build canonical {@link createLocalPObjectId}s without relying on the
 * accessor itself to remember its path.
 *
 * Includes `root` itself in the walk.
 */
export function findDescendantsByType<A extends AccessorLike<A>>(opts: {
  root: A;
  rootPath: ReadonlyArray<string>;
  collectTypes: ReadonlyArray<string>;
  descendTypes?: ReadonlyArray<string>;
}): DescendantHit<A>[] {
  const { root, rootPath, collectTypes, descendTypes = DESCEND_TYPES } = opts;
  const collectSet = new Set(collectTypes);
  const descendSet = new Set(descendTypes);
  const result: DescendantHit<A>[] = [];

  const stack: DescendantHit<A>[] = [{ node: root, path: rootPath }];
  while (stack.length > 0) {
    const { node, path } = stack.pop()!;
    const typeName = node.resourceType.name;
    if (collectSet.has(typeName)) {
      result.push({ node, path });
      continue;
    }
    if (!descendSet.has(typeName)) continue;
    const fields = node.listInputFields();
    for (let i = fields.length - 1; i >= 0; i--) {
      const child = node.traverse({
        field: fields[i],
        assertFieldType: "Input",
        ignoreError: true,
      });
      if (child !== undefined) stack.push({ node: child, path: [...path, fields[i]] });
    }
  }
  return result;
}

/**
 * Walk an accessor root and return one {@link LeafEntry} per discovered column.
 * Ids are {@link createLocalPObjectId}-shaped: `{resolvePath, name}`. The
 * `resolvePath` is derived from `rootPath` extended by the DFS traversal.
 */
export function indexAccessorRoot<A extends AccessorLike<A>>(
  root: A,
  rootPath: ReadonlyArray<string>,
): LeafEntry<A>[] {
  const result: LeafEntry<A>[] = [];
  for (const { node, path } of findDescendantsByType({
    root,
    rootPath,
    collectTypes: COLLECT_TYPES,
    descendTypes: DESCEND_TYPES,
  })) {
    for (const name of listColumnNames(node)) {
      result.push({
        accessor: node,
        name,
        id: createLocalPObjectId([...path], name),
      });
    }
  }
  return result;
}

/**
 * Walk one upstream-block ctx pair (`prodCtx` then `stagingCtx`) and return one
 * {@link LeafEntry} per column. First-wins dedup by name (prod precedes staging).
 * Ids are {@link createGlobalPObjectId}-shaped — `resolvePath` is not involved.
 */
export function indexPoolBlock<A extends AccessorLike<A>>(
  block: UpstreamBlockCtx<A>,
): LeafEntry<A>[] {
  const accessors: A[] = [];
  if (block.prodCtx) accessors.push(block.prodCtx);
  if (block.stagingCtx) accessors.push(block.stagingCtx);

  const result: LeafEntry<A>[] = [];
  const seen = new Set<string>();
  for (const accessor of accessors) {
    for (const name of listColumnNames(accessor)) {
      if (seen.has(name)) continue;
      seen.add(name);
      result.push({
        accessor,
        name,
        id: createGlobalPObjectId(block.blockId, name),
      });
    }
  }
  return result;
}
