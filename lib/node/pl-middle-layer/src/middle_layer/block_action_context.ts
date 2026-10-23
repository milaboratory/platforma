import { parseSignedResourceId } from "@milaboratories/pl-client";
import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { projectFieldName } from "../model/project_model";

/** Which render of a block the action context tree belongs to. */
export type BlockActionContextMode = "prod" | "staging";

/** An action transition: transition/<namespace>/<resource>/<ns> in an action context. */
export type BlockActionTransition = {
  namespace: string;
  /** The resource that reported, e.g. the render or a command it created. */
  resource: string;
  /** Server clock in nanoseconds when the transition was recorded, as a decimal string. */
  timestampNs: string;
  state: string;
  detail: string;
  reason: string;
};

/**
 * A reading: reading/<namespace>/<resource>/<key> in an action context. The backend sets it asynchronously:
 * of two readings of one key, the one from the transaction opened later stays.
 */
export type BlockActionReading = {
  namespace: string;
  resource: string;
  key: string;
  /** Opaque bytes as UTF-8 text; the reporter owns the format. */
  value: string;
};

/** One action context: the action context of one render and the renders it created. */
export type BlockActionContextNode = {
  /**
   * Global resource ID of this ActionContext resource itself, as a decimal string. Not the ID of the
   * render it describes: that is {@link BlockActionContextNode.resource}. Pass it back to the MCP
   * tool to fetch this node's subtree.
   */
  contextId: string;
  /**
   * The render the context belongs to: the resource of its first transition under namespace "render",
   * which the workflow controller records when it evaluates the render.
   * Undefined until that transition is applied, or on a backend without block action context reports.
   */
  resource?: string;
  /** Context baggage: name, block-pack, block-id, run-id and so on. */
  baggage: Record<string, string>;
  /** In time order. */
  transitions: BlockActionTransition[];
  readings: BlockActionReading[];
  children: BlockActionContextNode[];
};

const childFieldPrefix = "child/";

/**
 * Reads the action context tree of a block render from the synchronized project tree: the root action
 * context the project holds in <blockId>-prodActionContext or <blockId>-stagingActionContext, and every
 * child context under it. Watches every context it reads.
 *
 * @returns undefined when the block has no action context: it was not rendered yet, or the backend
 *          does not support block action context.
 */
export function blockActionContextTree(
  prj: PlTreeNodeAccessor,
  blockId: string,
  mode: BlockActionContextMode,
): BlockActionContextNode | undefined {
  const field = projectFieldName(
    blockId,
    mode === "prod" ? "prodActionContext" : "stagingActionContext",
  );
  const context = prj.traverse({ field, stableIfNotFound: true });
  return context === undefined ? undefined : actionContextNode(context);
}

function actionContextNode(context: PlTreeNodeAccessor): BlockActionContextNode {
  const data = context.getDataAsString();
  const baggage = data ? (JSON.parse(data) as Record<string, string>) : {};

  const transitions: BlockActionTransition[] = [];
  const readings: BlockActionReading[] = [];
  for (const { key, value } of context.listKeyValuesAsString()) {
    const parts = key.split("/");
    if (parts[0] === "transition" && parts.length === 4) {
      const parsed = JSON.parse(value) as { state?: string; detail?: string; reason?: string };
      transitions.push({
        namespace: parts[1],
        resource: parts[2],
        timestampNs: parts[3],
        state: parsed.state ?? "",
        detail: parsed.detail ?? "",
        reason: parsed.reason ?? "",
      });
    } else if (parts[0] === "reading" && parts.length === 4) {
      readings.push({ namespace: parts[1], resource: parts[2], key: parts[3], value });
    }
  }
  transitions.sort((a, b) => compareDecimal(a.timestampNs, b.timestampNs));

  const children: BlockActionContextNode[] = [];
  for (const field of context.listDynamicFields()) {
    if (!field.startsWith(childFieldPrefix)) continue;
    const child = context.traverse({ field, stableIfNotFound: true });
    if (child !== undefined) children.push(actionContextNode(child));
  }

  return {
    contextId: String(parseSignedResourceId(context.id).globalId),
    resource: transitions.find((t) => t.namespace === "render")?.resource,
    baggage,
    transitions,
    readings,
    children,
  };
}

/** Compares non-negative decimal integers given as strings. */
function compareDecimal(a: string, b: string): number {
  return a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0;
}
