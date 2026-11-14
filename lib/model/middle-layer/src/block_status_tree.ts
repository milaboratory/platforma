/**
 * A block run's action-context tree, node by node, as the middle layer hands it to the Desktop App.
 *
 * A run can make thousands of contexts, so this is never the whole tree: the root and its top-level
 * contexts are always present, and a context's children are present only while the reader has
 * expanded it.
 *
 * Source: docs/text/work/projects/sdk/block-status/README_teo.md, "Developer debug panel", which
 * is what the Desktop App shows it in.
 */

import type { BlockStatusSummary } from "./block_status";

/** One transition: `transition/<namespace>/<reporter>/<ns>`. */
export type BlockStatusTreeTransition = {
  /** `render`, `exec`, `workdir`, ... */
  readonly namespace: string;
  /** The resource that reported: the render itself, or a command or work dir it created. */
  readonly reporter: string;
  /** As written by the reporter. Can be a state this build does not know. */
  readonly state: string;
  readonly detail?: string;
  readonly reason?: string;
  /** ms since the epoch, on the reporter's clock. */
  readonly at: number;
};

/** One reading of a node: `reading/<namespace>/<resource>/<key>`. */
export type BlockStatusTreeReading = {
  /** The namespace the reading was written under, e.g. `workdir`. */
  readonly namespace: string;
  /** The resource that wrote it. */
  readonly resource: string;
  readonly key: string;
  /** Opaque text; the reporter owns the format. */
  readonly value: string;
};

/** One action context of the run. */
export type BlockStatusTreeNode = {
  /** Global id of the context, the handle for expanding it. */
  readonly contextId: string;
  /** The context's `name` baggage, falling back to the context id. */
  readonly name: string;
  /**
   * What the node is: `command` when a command reported into it, `workdir` when only a work dir
   * did, else `render`.
   */
  readonly kind: "render" | "command" | "workdir";
  /** The rest of the baggage: `block-pack`, `block-id`, `run-id`, ... */
  readonly baggage: Readonly<Record<string, string>>;
  /** The state holding the node as its reporter wrote it, undefined once it has ended or before it
   * reports. */
  readonly state?: string;
  /** True for `Running` reported by a command executing on a machine. */
  readonly onMachine: boolean;
  /** When the node entered {@link state}, ms since the epoch. */
  readonly enteredAt?: number;
  /** True once the node's render has ended and every reporter in it has too, or the run was
   * cancelled. */
  readonly ended: boolean;
  /** The engine's reason, set when the render terminated; `cancelled` for a node the user's stop
   * ended. */
  readonly failure?: string;
  /** Every transition of every reporter, oldest first, whatever its state. */
  readonly transitions: readonly BlockStatusTreeTransition[];
  /** Readings, sorted by namespace, then resource, then key. */
  readonly readings: readonly BlockStatusTreeReading[];
  /** Direct children, whether or not they are present below. */
  readonly childCount: number;
  /** This node and everything under it. */
  readonly subtreeContexts: number;
  /** Contexts in this subtree that have not ended. */
  readonly subtreeActiveContexts: number;
  /**
   * Time commands in this subtree spent running on a machine, ms. A command still running counts
   * up to the latest report anywhere in the run.
   */
  readonly subtreeComputeMs: number;
  /** The children, present only while the node is expanded. The root's are always present. */
  readonly children?: readonly BlockStatusTreeNode[];
};

/** A branch of the run, one of the root's top-level contexts with everything under it. */
export type BlockStatusTreeBranch = {
  readonly contextId: string;
  readonly name: string;
  readonly value: number;
};

/** The heaviest branches of the run, each list largest first. */
export type BlockStatusTreeHeaviest = {
  /** By {@link BlockStatusTreeNode.subtreeComputeMs}. */
  readonly byCompute: readonly BlockStatusTreeBranch[];
  /** By {@link BlockStatusTreeNode.subtreeContexts}. */
  readonly byContexts: readonly BlockStatusTreeBranch[];
  /**
   * By bytes of output. Undefined while no reporter writes file sizes, which is distinct from a run
   * that wrote nothing.
   */
  readonly byFileSize?: readonly BlockStatusTreeBranch[];
};

/** How many branches each heaviest list carries. */
export const BlockStatusTreeHeaviestCount = 5;

/** The tree of one block run. */
export type BlockStatusTree = {
  /** The run's summary, the same one `watchBlockStatus` gives. */
  readonly summary: BlockStatusSummary;
  readonly heaviest: BlockStatusTreeHeaviest;
  /** The root context, undefined while the block has none. */
  readonly root?: BlockStatusTreeNode;
  /**
   * The context ids from the root down to the render that terminated first, so a reader can open
   * the tree to it. Undefined while no render has terminated.
   */
  readonly firstFailurePath?: readonly string[];
};
