import type { PlClient, PlTransaction, SignedResourceId } from "@milaboratories/pl-client";
import { isNullSignedResourceId, parseSignedResourceId } from "@milaboratories/pl-client";
import { projectFieldName } from "../model/project_model";

/** Which render of a block the status tree belongs to. */
export type BlockStatusMode = "prod" | "staging";

/** A status transition: transition/<topic>/<resource>/<ns> in a status context. */
export type BlockStatusTransition = {
  topic: string;
  /** The resource that reported, e.g. the render or a command it created. */
  resource: string;
  /** Server clock in nanoseconds when the transition was recorded, as a decimal string. */
  timestampNs: string;
  state: string;
  detail: string;
  reason: string;
};

/** A status attribute: attr/<topic>/<resource>/<key>/<tx ID> in a status context. */
export type BlockStatusAttribute = {
  topic: string;
  resource: string;
  key: string;
  /** Opaque bytes as UTF-8 text; the reporter owns the format. */
  value: string;
};

/** One status context: the status of one render and the renders it created. */
export type BlockStatusNode = {
  contextId: string;
  /** Context data: resource, root, name, block-pack, block-id and so on. */
  data: Record<string, string>;
  /** In time order. */
  transitions: BlockStatusTransition[];
  attributes: BlockStatusAttribute[];
  children: BlockStatusNode[];
};

const childFieldPrefix = "child/";

/**
 * Reads the status tree of a block render: the root status context the project holds in
 * <blockId>-prodStatus or <blockId>-stagingStatus, and every child context under it.
 * Reads the current state in one transaction; it does not watch for changes.
 *
 * @returns undefined when the block has no status context: it was not rendered yet, or the backend
 *          does not support block status.
 */
export async function readBlockStatusTree(
  pl: PlClient,
  projectRid: SignedResourceId,
  blockId: string,
  mode: BlockStatusMode,
): Promise<BlockStatusNode | undefined> {
  return await pl.withReadTx("readBlockStatusTree", async (tx) => {
    const project = await tx.getResourceData(projectRid, true);
    const fieldName = projectFieldName(blockId, mode === "prod" ? "prodStatus" : "stagingStatus");
    const statusField = project.fields.find((f) => f.name === fieldName);
    if (statusField === undefined || isNullSignedResourceId(statusField.value)) return undefined;

    return await readStatusNode(tx, statusField.value);
  });
}

async function readStatusNode(
  tx: PlTransaction,
  contextRef: SignedResourceId,
): Promise<BlockStatusNode> {
  const [context, kvs] = await Promise.all([
    tx.getResourceData(contextRef, true),
    tx.listKeyValuesString(contextRef),
  ]);

  const data =
    context.data === undefined || context.data.length === 0
      ? {}
      : (JSON.parse(Buffer.from(context.data).toString()) as Record<string, string>);

  const transitions: BlockStatusTransition[] = [];
  const attributes: BlockStatusAttribute[] = [];
  for (const { key, value } of kvs) {
    const parts = key.split("/");
    if (parts[0] === "transition" && parts.length === 4) {
      const parsed = JSON.parse(value) as { state?: string; detail?: string; reason?: string };
      transitions.push({
        topic: parts[1],
        resource: parts[2],
        timestampNs: parts[3],
        state: parsed.state ?? "",
        detail: parsed.detail ?? "",
        reason: parsed.reason ?? "",
      });
    } else if (parts[0] === "attr" && parts.length === 5) {
      // the last part is the version: the ID of the transaction that wrote the value
      attributes.push({ topic: parts[1], resource: parts[2], key: parts[3], value });
    }
  }
  transitions.sort((a, b) => compareDecimal(a.timestampNs, b.timestampNs));

  const childRefs: SignedResourceId[] = [];
  for (const f of context.fields) {
    if (f.name.startsWith(childFieldPrefix) && !isNullSignedResourceId(f.value))
      childRefs.push(f.value);
  }
  const children = await Promise.all(childRefs.map((ref) => readStatusNode(tx, ref)));

  return {
    contextId: String(parseSignedResourceId(contextRef).globalId),
    data,
    transitions,
    attributes,
    children,
  };
}

/** Compares non-negative decimal integers given as strings. */
function compareDecimal(a: string, b: string): number {
  return a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0;
}
