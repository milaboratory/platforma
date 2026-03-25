import type { MiddleLayer, ProjectListEntry } from "@milaboratories/pl-middle-layer";
import type { PlMcpServerCallbacks } from "../server";

export interface AuthorMarker {
  authorId: string;
  localVersion: number;
}

export interface ToolContext {
  getMl: () => MiddleLayer | undefined;
  requireMl: () => MiddleLayer;
  resolveProject: (projectId: string) => Promise<ProjectListEntry>;
  getOpenedProject: (projectId: string) => Promise<any>;
  callbacks: PlMcpServerCallbacks;
  /** Returns an AuthorMarker with auto-incrementing localVersion for this MCP session. */
  getAuthorMarker: () => AuthorMarker;
}

export function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

const NODE_LIMIT = 10_000;

/**
 * Estimate in-memory size of a value by traversal, without serialization.
 * Returns byte estimate, or a string like ">10000 nodes" if the object is too large to traverse.
 */
export function estimateSize(value: unknown): number | string {
  let nodes = 0;
  let size = 0;

  function walk(v: unknown): void {
    if (++nodes > NODE_LIMIT) return;
    if (v === null || v === undefined) return;
    switch (typeof v) {
      case "string":
        size += v.length * 2;
        return;
      case "number":
        size += 8;
        return;
      case "boolean":
        size += 4;
        return;
      case "bigint":
        size += 8;
        return;
      default:
        break;
    }
    if (v instanceof Uint8Array || ArrayBuffer.isView(v)) {
      size += (v as Uint8Array).byteLength;
      return;
    }
    if (Array.isArray(v)) {
      size += 8;
      for (const item of v) {
        if (nodes > NODE_LIMIT) return;
        walk(item);
      }
      return;
    }
    if (typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (nodes > NODE_LIMIT) return;
        size += k.length * 2;
        walk(val);
      }
    }
  }

  walk(value);
  return nodes > NODE_LIMIT ? `>${NODE_LIMIT} nodes` : size;
}

/** Return an MCP error result with an actionable hint for the AI agent. */
export function errorResult(message: string, hint?: string) {
  const text = hint ? `${message}\n\nHint: ${hint}` : message;
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
}
