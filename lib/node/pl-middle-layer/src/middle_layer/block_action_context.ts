import type { PlClient, PlTransaction, SignedResourceId } from "@milaboratories/pl-client";
import { isNullSignedResourceId, parseSignedResourceId } from "@milaboratories/pl-client";
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
  contextId: string;
  /**
   * The render the context belongs to: the resource of its first transition under namespace "core".
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
 * Reads the action context tree of a block render: the root action context the project holds in
 * <blockId>-prodActionContext or <blockId>-stagingActionContext, and every child context under it.
 * Reads the current state in one transaction; it does not watch for changes.
 *
 * @returns undefined when the block has no action context: it was not rendered yet, or the backend
 *          does not support block action context.
 */
export async function readBlockActionContextTree(
  pl: PlClient,
  projectRid: SignedResourceId,
  blockId: string,
  mode: BlockActionContextMode,
): Promise<BlockActionContextNode | undefined> {
  return await pl.withReadTx("readBlockActionContextTree", async (tx) => {
    const project = await tx.getResourceData(projectRid, true);
    const fieldName = projectFieldName(
      blockId,
      mode === "prod" ? "prodActionContext" : "stagingActionContext",
    );
    const actionContextField = project.fields.find((f) => f.name === fieldName);
    if (actionContextField === undefined || isNullSignedResourceId(actionContextField.value))
      return undefined;

    return await readActionContextNode(tx, actionContextField.value);
  });
}

async function readActionContextNode(
  tx: PlTransaction,
  contextRef: SignedResourceId,
): Promise<BlockActionContextNode> {
  const [context, kvs] = await Promise.all([
    tx.getResourceData(contextRef, true),
    tx.listKeyValuesString(contextRef),
  ]);

  const baggage =
    context.data === undefined || context.data.length === 0
      ? {}
      : (JSON.parse(Buffer.from(context.data).toString()) as Record<string, string>);

  const transitions: BlockActionTransition[] = [];
  const readings: BlockActionReading[] = [];
  for (const { key, value } of kvs) {
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

  const childRefs: SignedResourceId[] = [];
  for (const f of context.fields) {
    if (f.name.startsWith(childFieldPrefix) && !isNullSignedResourceId(f.value))
      childRefs.push(f.value);
  }
  const children = await Promise.all(childRefs.map((ref) => readActionContextNode(tx, ref)));

  return {
    contextId: String(parseSignedResourceId(contextRef).globalId),
    resource: transitions.find((t) => t.namespace === "core")?.resource,
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
