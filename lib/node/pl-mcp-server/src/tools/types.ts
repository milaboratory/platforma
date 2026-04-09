import { runInNewContext } from "node:vm";
import type { MiddleLayer, Project, ProjectListEntry } from "@milaboratories/pl-middle-layer";
import type { PlMcpServerCallbacks } from "../server";

export interface AuthorMarker {
  authorId: string;
  localVersion: number;
}

export interface ToolContext {
  getMl: () => MiddleLayer | null;
  requireMl: () => MiddleLayer;
  resolveProject: (projectId: string) => Promise<ProjectListEntry>;
  getOpenedProject: (projectId: string) => Promise<Project>;
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
const CHARS_PER_TOKEN = 4;

/**
 * Estimate the number of LLM tokens needed to represent a value as JSON,
 * without actually serializing it. Walks the object tree and sums up
 * the JSON character lengths, then divides by ~4 chars/token.
 *
 * Returns token estimate, or a string like ">1234 (truncated at 10000 nodes)"
 * if the object graph is too large to fully traverse.
 */
export function estimateTokens(value: unknown, nodeLimit = NODE_LIMIT): number | string {
  let nodes = 0;
  let chars = 0;

  /** Returns true if node limit exceeded. */
  function walk(v: unknown): boolean {
    if (++nodes > nodeLimit) return true;
    if (v === null || v === undefined) {
      chars += 4; // "null"
      return false;
    }
    switch (typeof v) {
      case "string":
        chars += v.length + 2; // content + quotes
        return false;
      case "number":
        chars += String(v).length;
        return false;
      case "boolean":
        chars += v ? 4 : 5; // "true" or "false"
        return false;
      case "bigint":
        chars += String(v).length;
        return false;
      default:
        break;
    }
    if (v instanceof Uint8Array || ArrayBuffer.isView(v)) {
      // serialized as array of numbers
      const arr = v as Uint8Array;
      chars += 2 + Math.max(0, arr.length - 1); // [] + commas
      for (let i = 0; i < arr.length; i++) {
        chars += String(arr[i]).length;
      }
      return false;
    }
    if (Array.isArray(v)) {
      chars += 2; // []
      if (v.length > 1) chars += v.length - 1; // commas
      for (const item of v) {
        if (walk(item)) return true;
      }
      return false;
    }
    if (typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>);
      chars += 2; // {}
      if (entries.length > 1) chars += entries.length - 1; // commas
      for (const [k, val] of entries) {
        chars += k.length + 3; // "key":
        if (walk(val)) return true;
      }
    }
    return false;
  }

  const overflow = walk(value);
  const tokens = Math.ceil(chars / CHARS_PER_TOKEN);
  return overflow ? `>${tokens} (truncated at ${nodeLimit} nodes)` : tokens;
}

/** Summarize block outputs as concise key/ok/hasValue/tokensEstimate entries. */
export function summarizeOutputs(
  outputs: Record<string, unknown> | undefined,
): { key: string; ok: boolean; hasValue: boolean; tokensEstimate?: number | string }[] {
  if (!outputs) return [];
  return Object.entries(outputs).map(([key, out]) => {
    const o = out as { ok?: boolean; value?: unknown } | undefined;
    const hasValue = o?.value != null;
    const tokensEstimate = hasValue ? estimateTokens(o!.value) : undefined;
    return { key, ok: o?.ok ?? false, hasValue, tokensEstimate };
  });
}

/**
 * Evaluate a JS expression in a sandboxed VM context.
 * The expression has access to the provided variables.
 */
export function safeEval(
  expression: string,
  context: Record<string, unknown>,
  timeout: number,
): unknown {
  return runInNewContext(`(${expression})`, context, {
    timeout,
    filename: "transform",
  });
}

/** Return an MCP error result with an actionable hint for the AI agent. */
export function errorResult(message: string, hint?: string) {
  const text = hint ? `${message}\n\nHint: ${hint}` : message;
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
}
