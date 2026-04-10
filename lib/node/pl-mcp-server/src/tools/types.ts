import { runInNewContext } from "node:vm";
import type {
  AuthorMarker,
  MiddleLayer,
  Project,
  ProjectListEntry,
} from "@milaboratories/pl-middle-layer";
import type { PlMcpServerCallbacks } from "../server";

export type { AuthorMarker };

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
