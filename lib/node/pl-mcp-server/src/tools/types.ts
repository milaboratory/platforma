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

/** Return an MCP error result with an actionable hint for the AI agent. */
export function errorResult(message: string, hint?: string) {
  const text = hint ? `${message}\n\nHint: ${hint}` : message;
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
}
