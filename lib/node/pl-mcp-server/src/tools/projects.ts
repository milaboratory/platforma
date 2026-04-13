import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resourceIdToString } from "@milaboratories/pl-middle-layer";
import { z } from "zod";
import type { ToolContext } from "./types";
import { textResult } from "./types";

export function registerProjectTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_projects",
    { description: "List all projects with their IDs, labels, and status" },
    async () => {
      const ml = ctx.requireMl();
      await ml.projectList.refreshState();
      const projects = await ml.projectList.awaitStableValue();
      return textResult(
        projects.map((p) => ({
          projectId: resourceIdToString(p.rid),
          label: p.meta.label,
          opened: p.opened,
          created: p.created.toISOString(),
          lastModified: p.lastModified.toISOString(),
        })),
      );
    },
  );

  server.registerTool(
    "create_project",
    {
      description: "Create a new project",
      inputSchema: { label: z.string().describe("Project name") },
    },
    async ({ label }) => {
      const rid = await ctx.requireMl().createProject({ label });
      const projectId = resourceIdToString(rid);
      await ctx.callbacks.onProjectCreated?.(projectId);
      return textResult({ projectId });
    },
  );

  server.registerTool(
    "open_project",
    {
      description: "Open a project for editing. Required before working with blocks.",
      inputSchema: {
        projectId: z.string().describe("Project ID from list_projects or create_project"),
      },
    },
    async ({ projectId }) => {
      const entry = await ctx.resolveProject(projectId);
      await ctx.requireMl().openProject(entry.rid);
      await ctx.callbacks.onProjectOpened?.(projectId);
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "close_project",
    {
      description: "Close an opened project, releasing its resources",
      inputSchema: { projectId: z.string().describe("Project ID") },
    },
    async ({ projectId }) => {
      const entry = await ctx.resolveProject(projectId);
      await ctx.requireMl().closeProject(entry.rid);
      await ctx.callbacks.onProjectClosed?.(projectId);
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "delete_project",
    {
      description: "Delete a project permanently. The project must be closed first.",
      inputSchema: { projectId: z.string().describe("Project ID") },
    },
    async ({ projectId }) => {
      const entry = await ctx.resolveProject(projectId);
      await ctx.requireMl().deleteProject(entry.id);
      await ctx.callbacks.onProjectDeleted?.(projectId);
      return textResult({ ok: true });
    },
  );
}
