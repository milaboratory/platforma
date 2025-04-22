import type { Block, ProjectStructure } from './project_model';
import type { Optional, Writable } from 'utility-types';
import { inferAllReferencedBlocks } from './args';

export function allBlocks(structure: ProjectStructure): Iterable<Block> {
  return {
    *[Symbol.iterator]() {
      for (const g of structure.groups) for (const b of g.blocks) yield b;
    },
  };
}

export interface BlockGraphNode {
  readonly id: string;
  readonly missingReferences: boolean;
  /** Upstreams, calculated accounting for potential indirect block dependencies  */
  readonly upstream: Set<string>;
  /** Direct upstream, listed in block args */
  readonly directUpstream: Set<string>;
  /** Downstreams, calculated accounting for potential indirect block dependencies  */
  readonly downstream: Set<string>;
  /** Direct downstreams listing our block in it's args */
  readonly directDownstream: Set<string>;
}

export class BlockGraph {
  /** Nodes are stored in the map in topological order */
  public readonly nodes: Map<string, BlockGraphNode>;

  constructor(nodes: Map<string, BlockGraphNode>) {
    this.nodes = nodes;
  }

  public traverseIds(
    direction: 'upstream' | 'downstream' | 'directUpstream' | 'directDownstream',
    ...rootBlockIds: string[]
  ): Set<string> {
    const all = new Set<string>();
    this.traverse(direction, rootBlockIds, (node) => all.add(node.id));
    return all;
  }

  public traverseIdsExcludingRoots(
    direction: 'upstream' | 'downstream' | 'directUpstream' | 'directDownstream',
    ...rootBlockIds: string[]
  ): Set<string> {
    const result = this.traverseIds(direction, ...rootBlockIds);
    for (const r of rootBlockIds) result.delete(r);
    return result;
  }

  public traverse(
    direction: 'upstream' | 'downstream' | 'directUpstream' | 'directDownstream',
    rootBlockIds: string[],
    cb: (node: BlockGraphNode) => void,
  ): void {
    let unprocessed = [...rootBlockIds];
    // used to deduplicate possible downstream / upstream blocks and process them only once
    const queued = new Set<string>(unprocessed);
    while (unprocessed.length > 0) {
      const nextUnprocessed: string[] = [];
      for (const blockId of unprocessed) {
        const info = this.nodes.get(blockId)!;
        cb(info);
        info[direction].forEach((v) => {
          if (!queued.has(v)) {
            queued.add(v);
            nextUnprocessed.push(v);
          }
        });
      }
      unprocessed = nextUnprocessed;
    }
  }
}

export function stagingGraph(structure: ProjectStructure) {
  type WNode = Optional<Writable<BlockGraphNode>, 'upstream' | 'downstream' | 'directUpstream' | 'directDownstream'>;
  const result = new Map<string, WNode>();

  // Simple dependency graph from previous to next
  //
  //   more complicated patterns to be implemented later
  //   (i.e. groups with specific behaviours for total outputs and inputs)
  //
  let previous: WNode | undefined = undefined;
  for (const { id } of allBlocks(structure)) {
    const current: WNode = {
      id: id,
      missingReferences: false,
    };
    result.set(id, current);
    if (previous === undefined) {
      current.directUpstream = current.upstream = new Set<string>();
    } else {
      current.directUpstream = current.upstream = new Set<string>([previous.id]);
      previous.directDownstream = previous.downstream = new Set<string>([current.id]);
    }

    previous = current;
  }
  if (previous !== undefined) previous.directDownstream = previous.downstream = new Set<string>();

  return new BlockGraph(result as Map<string, BlockGraphNode>);
}

export function productionGraph(
  structure: ProjectStructure,
  argsProvider: (blockId: string) => unknown,
): BlockGraph {
  const resultMap = new Map<string, BlockGraphNode>();
  // result graph is constructed to be able to perform traversal on incomplete graph
  // to calculate potentialUpstreams
  const resultGraph = new BlockGraph(resultMap);

  // traversing blocks in topological order defined by the project structure
  // and keeping possibleUpstreams set on each step, to consider only
  // those dependencies that are possible under current topology
  const allAbove = new Set<string>();
  for (const { id } of allBlocks(structure)) {
    const args = argsProvider(id);

    // skipping those blocks for which we don't have args
    if (args === undefined) continue;

    const directUpstreams = inferAllReferencedBlocks(args, allAbove);

    // The algorithm here adds all downstream blocks of direct upstreams as potential upstreams.
    // They may produce additional columns, anchored in our direct upstream, those columns might be needed by the workflow.
    const potentialUpstreams = resultGraph.traverseIds('directDownstream', ...directUpstreams.upstreams);

    // To minimize complexity of the graph, we leave only the closest upstreams, removing all their transitive dependencies,
    // relying on the traversal mechanisms in BContexts and on UI level to connect our block with all upstreams
    const upstreams = new Set<string>();
    for (const { id: pId } of allBlocks(structure)) {
      if (pId === id) break; // stopping on current block
      if (potentialUpstreams.has(pId)) {
        upstreams.add(pId);
        for (const transitiveUpstream of resultGraph.traverseIdsExcludingRoots('upstream', pId))
          upstreams.delete(transitiveUpstream);
      }
    }

    const node: BlockGraphNode = {
      id,
      missingReferences: directUpstreams.missingReferences,
      upstream: upstreams,
      directUpstream: directUpstreams.upstreams,
      downstream: new Set<string>(), // will be populated from downstream blocks
      directDownstream: new Set<string>(), // will be populated from downstream blocks
    };
    resultMap.set(id, node);
    directUpstreams.upstreams.forEach((dep) => resultMap.get(dep)!.directDownstream.add(id));
    upstreams.forEach((dep) => resultMap.get(dep)!.downstream.add(id));
    allAbove.add(id);
  }

  return resultGraph;
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const e of a) if (!b.has(e)) return false;
  return true;
}

function intersects<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size > b.size) return intersects(b, a);
  for (const e of a) if (b.has(e)) return true;
  return false;
}

export interface GraphDiff {
  onlyInA: Set<string>;
  /** Nodes that changed the list of their upstreams,
   * and all their downstreams */
  different: Set<string>;
  onlyInB: Set<string>;
}

export function graphDiff(a: BlockGraph, b: BlockGraph): GraphDiff {
  const onlyInA = new Set<string>();
  const onlyInB = new Set<string>();
  const different = new Set<string>();
  a.nodes.forEach((fromA) => {
    const fromB = b.nodes.get(fromA.id);
    if (fromB === undefined) onlyInA.add(fromA.id);
    else if (!setsEqual(fromA.upstream, fromB.upstream) || intersects(fromA.upstream, different))
      different.add(fromA.id);
  });

  b.nodes.forEach((fromB) => {
    if (!a.nodes.has(fromB.id)) onlyInB.add(fromB.id);
    else if (intersects(fromB.upstream, different)) different.add(fromB.id);
  });

  return { onlyInA, onlyInB, different };
}
