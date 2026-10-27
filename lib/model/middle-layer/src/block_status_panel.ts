/**
 * The developer debug panel over a block run's action-context tree, as the middle layer hands it to
 * the Desktop App.
 *
 * A run can make thousands of nodes, so the panel is never the whole tree: the root and its
 * top-level nodes are always present, and a node's children are present only while the developer
 * has expanded it. The full tree is available separately, as the export.
 *
 * Source: docs/text/work/projects/sdk/block-status/README_teo.md, "Developer debug panel".
 */

import type { BlockStatusState, BlockStatusSummary } from "./block_status";

/** One reported transition, as the panel shows a node's last one. */
export type BlockStatusPanelTransition = {
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

/** One reading of a node: `reading/<topic>/<resource>/<key>`. */
export type BlockStatusPanelAttribute = {
  /** The namespace the reading was written under, e.g. `workdir`. */
  readonly topic: string;
  /** The resource that wrote it. */
  readonly resource: string;
  readonly key: string;
  /** Opaque text; the reporter owns the format. */
  readonly value: string;
};

/** One action context of the run. */
export type BlockStatusPanelNode = {
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
  /** The state holding the node, undefined once it has ended or before it reports. */
  readonly state?: BlockStatusState;
  /** True for `Running` reported by a command executing on a machine. */
  readonly onMachine: boolean;
  /** When the node entered {@link state}, ms since the epoch. */
  readonly enteredAt?: number;
  /** True once the node's render has ended and every reporter in it has too. */
  readonly ended: boolean;
  /** The engine's reason, set when the render terminated. */
  readonly failure?: string;
  /** The most recent transition of any reporter, whatever its state. */
  readonly lastTransition?: BlockStatusPanelTransition;
  /** Readings, sorted by topic, then resource, then key. */
  readonly attributes: readonly BlockStatusPanelAttribute[];
  /** Direct children, whether or not they are present below. */
  readonly childCount: number;
  /** This node and everything under it. */
  readonly subtreeNodes: number;
  /** Live nodes in this subtree. */
  readonly subtreeLiveNodes: number;
  /**
   * Time commands in this subtree spent running on a machine, ms. A command still running counts
   * up to the latest report anywhere in the run.
   */
  readonly subtreeComputeMs: number;
  /** The children, present only while the node is expanded. The root's are always present. */
  readonly children?: readonly BlockStatusPanelNode[];
};

/** A branch of the run, one of the root's top-level nodes with everything under it. */
export type BlockStatusPanelBranch = {
  readonly contextId: string;
  readonly name: string;
  readonly value: number;
};

/** The heaviest branches of the run, each list largest first. */
export type BlockStatusPanelHeaviest = {
  /** By {@link BlockStatusPanelNode.subtreeComputeMs}. */
  readonly byCompute: readonly BlockStatusPanelBranch[];
  /** By {@link BlockStatusPanelNode.subtreeNodes}. */
  readonly byNodes: readonly BlockStatusPanelBranch[];
  /**
   * By bytes of output. Undefined while no reporter writes file sizes, which is distinct from a run
   * that wrote nothing.
   */
  readonly byFileSize?: readonly BlockStatusPanelBranch[];
};

/** How many branches each heaviest list carries. */
export const BlockStatusPanelHeaviestCount = 5;

/** What the debug panel shows for one block run. */
export type BlockStatusPanel = {
  /** The same summary the status line is built from. */
  readonly summary: BlockStatusSummary;
  readonly heaviest: BlockStatusPanelHeaviest;
  /** The root context, undefined while the block has none. */
  readonly root?: BlockStatusPanelNode;
};
