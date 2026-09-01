import type { McpServer } from "@modelcontextprotocol/server";
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
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
          projectId: p.id,
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
      inputSchema: toStandardJsonSchema(
        v.object({ label: v.pipe(v.string(), v.description("Project name")) }),
      ),
    },
    async ({ label }) => {
      const projectId = await ctx.requireMl().createProject({ label });
      await ctx.callbacks.onProjectCreated?.(projectId);
      return textResult({ projectId });
    },
  );

  server.registerTool(
    "open_project",
    {
      description: "Open a project for editing. Required before working with blocks.",
      inputSchema: toStandardJsonSchema(
        v.object({
          projectId: v.pipe(
            v.string(),
            v.description("Project ID from list_projects or create_project"),
          ),
        }),
      ),
    },
    async ({ projectId }) => {
      const entry = await ctx.resolveProject(projectId);
      await ctx.requireMl().openProject(entry.id);
      await ctx.callbacks.onProjectOpened?.(projectId);
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "close_project",
    {
      description: "Close an opened project, releasing its resources",
      inputSchema: toStandardJsonSchema(
        v.object({ projectId: v.pipe(v.string(), v.description("Project ID")) }),
      ),
    },
    async ({ projectId }) => {
      const entry = await ctx.resolveProject(projectId);
      await ctx.requireMl().closeProject(entry.id);
      await ctx.callbacks.onProjectClosed?.(projectId);
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "delete_project",
    {
      description: "Delete a project permanently. The project must be closed first.",
      inputSchema: toStandardJsonSchema(
        v.object({ projectId: v.pipe(v.string(), v.description("Project ID")) }),
      ),
    },
    async ({ projectId }) => {
      const entry = await ctx.resolveProject(projectId);
      await ctx.requireMl().deleteProject(entry.id);
      await ctx.callbacks.onProjectDeleted?.(projectId);
      return textResult({ ok: true });
    },
  );
}
