import type { MiddleLayer, ProjectListEntry } from "@milaboratories/pl-middle-layer";
import type { PlMcpServerCallbacks } from "../server";

export interface ToolContext {
  getMl: () => MiddleLayer | undefined;
  requireMl: () => MiddleLayer;
  resolveProject: (projectId: string) => Promise<ProjectListEntry>;
  getOpenedProject: (projectId: string) => Promise<any>;
  callbacks: PlMcpServerCallbacks;
}

export function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}
