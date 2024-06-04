import { Block, ProjectStructure } from './project_model';
import { Optional, Writable } from 'utility-types';
import { inferAllReferencedBlocks } from './args';

export function allBlocks(structure: ProjectStructure): Iterable<Block> {
  return {
    * [Symbol.iterator]() {
      for (const g of structure.groups)
        for (const b of g.blocks)
          yield b;
    }
  };
}

export interface BlockGraphNode {
  readonly id: string;
  readonly missingReferences: boolean;
  /** Direct upstreams */
  readonly upstream: Set<string>;
  /** Direct downstreams */
  readonly downstream: Set<string>;
}

export class BlockGraph {
  /** Nodes are stored in the map in topological order */
  public readonly nodes: Map<string, BlockGraphNode>;

  constructor(nodes: Map<string, BlockGraphNode>) {
    this.nodes = nodes;
  }

  public traverse(direction: 'upstream' | 'downstream',
                  rootBlockIds: string[],
                  cb: (node: BlockGraphNode) => void): void {
    let unprocessed = rootBlockIds;
    // used to deduplicate possible downstream blocks and process them only once
    const queued = new Set<string>(unprocessed);
    while (unprocessed.length > 0) {
      let nextUnprocessed: string[] = [];
      for (const blockId of unprocessed) {
        const info = this.nodes.get(blockId)!;
        cb(info);
        info[direction]!.forEach(v => {
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
  type WNode = Optional<Writable<BlockGraphNode>, 'upstream' | 'downstream'>
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
      missingReferences: false
    };
    result.set(id, current);
    if (previous === undefined) {
      current.upstream = new Set<string>();
    } else {
      current.upstream = new Set<string>([previous.id]);
      previous.downstream = new Set<string>([current.id]);
    }

    previous = current;
  }
  if (previous !== undefined)
    previous.downstream = new Set<string>();

  return new BlockGraph(result as Map<string, BlockGraphNode>);
}

export function productionGraph(structure: ProjectStructure, argsProvider: (blockId: string) => any | undefined): BlockGraph {
  const result = new Map<string, BlockGraphNode>();

  // traversing blocks in topological order defined by the project structure
  // and keeping possibleUpstreams set on each step, to consider only
  // those dependencies that are possible under current topology
  const possibleUpstreams = new Set<string>();
  for (const { id } of allBlocks(structure)) {
    const args = argsProvider(id);

    // skipping those blocks for which we don't have args
    if (args === undefined)
      continue;

    const upstreams = inferAllReferencedBlocks(args, possibleUpstreams);
    const node: BlockGraphNode = {
      id, missingReferences: upstreams.missingReferences,
      upstream: upstreams.upstreams,
      downstream: new Set<string>() // will be populated from downstream blocks
    };
    result.set(id, node);
    upstreams.upstreams.forEach(dep => result.get(dep)!.downstream.add(id));
    possibleUpstreams.add(id);
  }

  return new BlockGraph(result);
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size)
    return false;
  for (const e of a)
    if (!b.has(e))
      return false;
  return true;
}

function intersects<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size > b.size)
    return intersects(b, a);
  for (const e of a)
    if (b.has(e))
      return true;
  return false;
}

export interface GraphDiff {
  onlyInA: Set<string>,
  /** Nodes that changed the list of their upstreams,
   * and all their downstreams */
  different: Set<string>,
  onlyInB: Set<string>
}

export function graphDiff(a: BlockGraph, b: BlockGraph): GraphDiff {
  let matched = 0;
  const onlyInA = new Set<string>();
  const onlyInB = new Set<string>();
  const different = new Set<string>();
  a.nodes.forEach(fromA => {
    const fromB = b.nodes.get(fromA.id);
    if (fromB === undefined)
      onlyInA.add(fromA.id);
    else if (!setsEqual(fromA.upstream, fromB.upstream) || intersects(fromA.upstream, different))
      different.add(fromA.id);
  });

  b.nodes.forEach(fromB => {
    if (!a.nodes.has(fromB.id))
      onlyInB.add(fromB.id);
    else if (intersects(fromB.upstream, different))
      different.add(fromB.id);
  });

  return { onlyInA, onlyInB, different };
}
