import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  type MiddleLayer,
  type BlockPackSpecAny,
  resourceIdToString,
} from "@milaboratories/pl-middle-layer";
import { z } from "zod";

export interface PlMcpServerCallbacks {
  onProjectCreated?: (projectId: string) => void | Promise<void>;
  onProjectOpened?: (projectId: string) => void | Promise<void>;
  onProjectClosed?: (projectId: string) => void | Promise<void>;
  onProjectDeleted?: (projectId: string) => void | Promise<void>;
  /** Capture the current application window as a PNG screenshot. Returns base64-encoded PNG. */
  captureScreenshot?: () => Promise<string>;
  /** Send an input event to the application window. */
  sendInputEvent?: (event: unknown) => Promise<void>;
  /** Execute JavaScript in the renderer and return the result. */
  executeJavaScript?: (code: string) => Promise<unknown>;
  /** List available blocks from all configured registries. */
  listAvailableBlocks?: (query?: string) => Promise<unknown[]>;
  /** Navigate the desktop UI to show a specific block. */
  selectBlock?: (projectId: string, blockId: string) => Promise<void>;
  /** Read recent lines from the application log. */
  readAppLog?: (lines: number, search?: string) => Promise<string>;
}

export interface PlMcpServerOptions {
  /** MiddleLayer instance providing access to projects, blocks, etc. */
  middleLayer: MiddleLayer;
  /** Port to listen on. */
  port: number;
  /** Secret path segment for URL security. */
  secret: string;
  /** Optional callbacks for project lifecycle events (e.g. to sync UI state). */
  callbacks?: PlMcpServerCallbacks;
}

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

export class PlMcpServer {
  private readonly ml: MiddleLayer;
  private readonly port: number;
  private readonly secret: string;
  private readonly callbacks: PlMcpServerCallbacks;
  private httpServer: Server | undefined;
  private readonly transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(options: PlMcpServerOptions) {
    this.ml = options.middleLayer;
    this.port = options.port;
    this.secret = options.secret;
    this.callbacks = options.callbacks ?? {};
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/${this.secret}/mcp`;
  }

  async start(): Promise<void> {
    if (this.httpServer) {
      throw new Error("MCP server is already running");
    }

    const expectedPath = `/${this.secret}/mcp`;

    this.httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.headers.origin !== undefined) {
        try {
          const origin = new URL(req.headers.origin);
          if (origin.hostname !== "localhost" && origin.hostname !== "127.0.0.1") {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Forbidden" }));
            return;
          }
        } catch {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Forbidden" }));
          return;
        }
      }

      if (req.url !== expectedPath) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found" }));
        return;
      }

      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId && this.transports.has(sessionId)) {
        await this.transports.get(sessionId)!.handleRequest(req, res);
        return;
      }

      if (req.method === "POST") {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) this.transports.delete(sid);
        };

        const server = this.createMcpServer();
        await server.connect(transport);

        await transport.handleRequest(req, res);

        const sid = transport.sessionId;
        if (sid) this.transports.set(sid, transport);
        return;
      }

      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Bad Request: no valid session" }));
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(this.port, "127.0.0.1", () => resolve());
      this.httpServer!.once("error", reject);
    });
  }

  async stop(): Promise<void> {
    for (const transport of this.transports.values()) {
      await transport.close();
    }
    this.transports.clear();

    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => (err ? reject(err) : resolve()));
      });
      this.httpServer = undefined;
    }
  }

  private createMcpServer(): McpServer {
    const server = new McpServer(
      { name: "platforma", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );
    this.registerTools(server);
    return server;
  }

  private registerTools(server: McpServer): void {
    this.registerPingTool(server);
    this.registerProjectTools(server);
    this.registerBlockTools(server);
    this.registerBlockStateTools(server);
    this.registerAwaitTools(server);
    this.registerLogTools(server);
    this.registerScreenshotTool(server);
    this.registerUIInteractionTools(server);
  }

  /** Resolves a project from the list by its projectId (resourceIdToString format). */
  private async resolveProject(projectId: string) {
    await this.ml.projectList.refreshState();
    const projects = await this.ml.projectList.awaitStableValue();
    const entry = projects.find((p) => resourceIdToString(p.rid) === projectId);
    if (!entry) throw new Error(`Project ${projectId} not found`);
    return entry;
  }

  /** Gets an opened project by projectId. Resolves via project list → rid → getOpenedProject. */
  private async getOpenedProject(projectId: string) {
    const entry = await this.resolveProject(projectId);
    return this.ml.getOpenedProject(entry.rid);
  }

  private registerPingTool(server: McpServer): void {
    server.registerTool("ping", { description: "Health check" }, async () => {
      return textResult({ status: "ok" });
    });
  }

  private registerProjectTools(server: McpServer): void {
    const ml = this.ml;

    server.registerTool(
      "list_projects",
      { description: "List all projects with their IDs, labels, and status" },
      async () => {
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
        const rid = await ml.createProject({ label });
        const projectId = resourceIdToString(rid);
        await this.callbacks.onProjectCreated?.(projectId);
        return textResult({ projectId });
      },
    );

    server.registerTool(
      "open_project",
      {
        description: "Open a project for editing. Required before working with blocks.",
        inputSchema: { projectId: z.string().describe("Project ID from list_projects or create_project") },
      },
      async ({ projectId }) => {
        const entry = await this.resolveProject(projectId);
        await ml.openProject(entry.rid);
        await this.callbacks.onProjectOpened?.(projectId);
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
        const entry = await this.resolveProject(projectId);
        await ml.closeProject(entry.rid);
        await this.callbacks.onProjectClosed?.(projectId);
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
        const entry = await this.resolveProject(projectId);
        await ml.deleteProject(entry.id);
        await this.callbacks.onProjectDeleted?.(projectId);
        return textResult({ ok: true });
      },
    );
  }

  private registerBlockTools(server: McpServer): void {
    server.registerTool(
      "add_block",
      {
        description:
          "Add a block to an opened project. Spec can be from-registry-v2 (for published blocks) or dev-v2 (for local dev blocks).",
        inputSchema: {
          projectId: z.string().describe("Project ID (must be opened)"),
          label: z.string().describe("Block label"),
          spec: z
            .union([
              z.object({
                type: z.literal("from-registry-v2"),
                registryUrl: z.string().describe("Registry URL"),
                id: z.object({
                  organization: z.string(),
                  name: z.string(),
                  version: z.string(),
                }),
              }),
              z.object({
                type: z.literal("dev-v2"),
                folder: z.string().describe("Path to block folder"),
              }),
            ])
            .describe("Block pack specification"),
        },
      },
      async ({ projectId, label, spec }) => {
        const project = await this.getOpenedProject(projectId);
        const blockId = await project.addBlock(label, spec as BlockPackSpecAny);
        return textResult({ blockId });
      },
    );

    server.registerTool(
      "remove_block",
      {
        description: "Remove a block from an opened project",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          blockId: z.string().describe("Block ID to remove"),
        },
      },
      async ({ projectId, blockId }) => {
        const project = await this.getOpenedProject(projectId);
        await project.deleteBlock(blockId);
        return textResult({ ok: true });
      },
    );

    server.registerTool(
      "run_block",
      {
        description: "Run a block. Stale upstream blocks are started automatically.",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          blockId: z.string().describe("Block ID to run"),
        },
      },
      async ({ projectId, blockId }) => {
        const project = await this.getOpenedProject(projectId);
        await project.runBlock(blockId);
        return textResult({ ok: true });
      },
    );

    server.registerTool(
      "stop_block",
      {
        description: "Stop a running block",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          blockId: z.string().describe("Block ID to stop"),
        },
      },
      async ({ projectId, blockId }) => {
        const project = await this.getOpenedProject(projectId);
        await project.stopBlock(blockId);
        return textResult({ ok: true });
      },
    );

    server.registerTool(
      "list_available_blocks",
      {
        description: "List available blocks from configured registries. Optional query to filter by name.",
        inputSchema: {
          query: z.string().optional().describe("Filter blocks by name (case-insensitive substring match)"),
        },
      },
      async ({ query }) => {
        if (!this.callbacks.listAvailableBlocks) {
          return textResult({ error: "Block registry not available" });
        }
        const blocks = await this.callbacks.listAvailableBlocks(query);
        return textResult(blocks);
      },
    );

    server.registerTool(
      "select_block",
      {
        description: "Navigate the desktop UI to show a specific block's interface",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          blockId: z.string().describe("Block ID to display"),
        },
      },
      async ({ projectId, blockId }) => {
        if (!this.callbacks.selectBlock) {
          return textResult({ error: "UI navigation not available" });
        }
        await this.callbacks.selectBlock(projectId, blockId);
        return textResult({ ok: true });
      },
    );
  }

  private registerBlockStateTools(server: McpServer): void {
    server.registerTool(
      "get_project_overview",
      {
        description:
          "Get project overview with all blocks and their statuses (calculationStatus, canRun, stale, errors, upstreams/downstreams)",
        inputSchema: {
          projectId: z.string().describe("Project ID (must be opened)"),
        },
      },
      async ({ projectId }) => {
        const project = await this.getOpenedProject(projectId);
        const overview = await project.overview.awaitStableValue();
        return textResult({
          label: overview.meta.label,
          blocks: overview.blocks.map((b) => ({
            id: b.id,
            title: b.title ?? b.label,
            calculationStatus: b.calculationStatus,
            canRun: b.canRun,
            stale: b.stale,
            inputsValid: b.inputsValid,
            outputErrors: b.outputErrors,
            upstreams: b.upstreams,
            downstreams: b.downstreams,
          })),
        });
      },
    );

    server.registerTool(
      "get_block_state",
      {
        description: "Get the current state/data of a block (its storage and outputs)",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          blockId: z.string().describe("Block ID"),
        },
      },
      async ({ projectId, blockId }) => {
        const project = await this.getOpenedProject(projectId);
        const state = await project.getBlockState(blockId).awaitStableValue();
        let data: unknown = undefined;
        if (state.blockStorage) {
          try {
            const parsed =
              typeof state.blockStorage === "string"
                ? JSON.parse(state.blockStorage)
                : state.blockStorage;
            data = parsed?.__data;
          } catch {
            data = state.blockStorage;
          }
        }
        return textResult({
          data,
          outputs: state.outputs,
        });
      },
    );

    server.registerTool(
      "set_block_data",
      {
        description: "Set the user-facing data of a block (triggers args derivation and staging)",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          blockId: z.string().describe("Block ID"),
          data: z.record(z.unknown()).describe("Block data object"),
        },
      },
      async ({ projectId, blockId, data }) => {
        const project = await this.getOpenedProject(projectId);
        await project.mutateBlockStorage(blockId, {
          operation: "update-block-data",
          value: data,
        });
        return textResult({ ok: true });
      },
    );
  }

  private registerAwaitTools(server: McpServer): void {
    server.registerTool(
      "await_block_done",
      {
        description:
          "Wait for a block to finish computation and outputs to stabilize. Returns block status and data on completion, or timeout info.",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          blockId: z.string().describe("Block ID to wait for"),
          timeout: z
            .number()
            .optional()
            .default(120000)
            .describe("Timeout in ms (default 120000)"),
        },
      },
      async ({ projectId, blockId, timeout }) => {
        const project = await this.getOpenedProject(projectId);
        const deadline = Date.now() + timeout;

        // Phase 1: poll overview until calculationStatus is Done or error
        while (Date.now() < deadline) {
          const overview = await project.overview.awaitStableValue();
          const block = overview.blocks.find((b) => b.id === blockId);
          if (!block) return textResult({ error: `Block ${blockId} not found in overview` });

          if (block.calculationStatus === "Done") {
            // Phase 2: await stable block state
            try {
              const state = await project
                .getBlockState(blockId)
                .awaitStableValue(AbortSignal.timeout(Math.max(deadline - Date.now(), 1000)));
              let data: unknown;
              if (state.blockStorage) {
                try {
                  const parsed =
                    typeof state.blockStorage === "string"
                      ? JSON.parse(state.blockStorage)
                      : state.blockStorage;
                  data = parsed?.__data;
                } catch {
                  data = state.blockStorage;
                }
              }
              return textResult({
                status: "Done",
                block: {
                  id: block.id,
                  title: block.title ?? block.label,
                  calculationStatus: block.calculationStatus,
                  canRun: block.canRun,
                  stale: block.stale,
                  outputErrors: block.outputErrors,
                },
                data,
                outputs: state.outputs,
              });
            } catch {
              return textResult({
                timedOut: true,
                status: "Done",
                note: "Computation done but outputs did not stabilize in time",
              });
            }
          }

          if (block.calculationStatus === "Limbo") {
            return textResult({
              status: "Limbo",
              error: "Block entered Limbo state (upstream failed or was stopped)",
            });
          }

          // Still running — wait for overview to change
          try {
            const result = await project.overview.getFullValue();
            await Promise.race([
              project.overview.awaitChange(AbortSignal.timeout(5000), result.uTag),
              new Promise((r) => setTimeout(r, 5000)),
            ]);
          } catch {
            // timeout on awaitChange — just re-poll
          }
        }

        // Timed out
        const overview = await project.overview.awaitStableValue();
        const block = overview.blocks.find((b) => b.id === blockId);
        return textResult({
          timedOut: true,
          status: block?.calculationStatus ?? "Unknown",
        });
      },
    );
  }

  private registerLogTools(server: McpServer): void {
    server.registerTool(
      "get_block_logs",
      {
        description:
          "Read execution logs for a block. Extracts log handles from block outputs and reads log content. Returns logs keyed by sample/run ID.",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          blockId: z.string().describe("Block ID"),
          lines: z.number().optional().default(100).describe("Number of lines per log (default 100)"),
          sampleId: z.string().optional().describe("Specific sample/key to read logs for (reads all if omitted)"),
        },
      },
      async ({ projectId, blockId, lines, sampleId }) => {
        const project = await this.getOpenedProject(projectId);
        const state = await project.getBlockState(blockId).awaitStableValue();
        if (!state.outputs) return textResult({ error: "Block has no outputs" });

        // Find log handles in outputs — look for the "logs" output
        const logsOutput = (state.outputs as Record<string, unknown>)?.["logs"] as
          | { ok: boolean; value?: { data?: { key: string[]; value: string }[] } }
          | undefined;
        if (!logsOutput?.ok || !logsOutput.value?.data) {
          return textResult({ error: "No log handles found in block outputs" });
        }

        const logEntries = logsOutput.value.data;
        const logDriver = this.ml.driverKit.logDriver;
        const results: Record<string, string> = {};

        for (const entry of logEntries) {
          const key = entry.key.join("/");
          if (sampleId && !entry.key.includes(sampleId)) continue;
          const handle = entry.value as `log+ready://log/${string}` | `log+live://log/${string}`;
          try {
            const response = await logDriver.lastLines(handle, lines);
            if (!response.shouldUpdateHandle) {
              results[key] = new TextDecoder().decode(response.data);
            }
          } catch (err) {
            results[key] = `Error reading log: ${err}`;
          }
        }

        return textResult(results);
      },
    );

    server.registerTool(
      "get_app_log",
      {
        description: "Read recent lines from the application log. Useful for debugging errors.",
        inputSchema: {
          lines: z.number().optional().default(50).describe("Number of lines to return (default 50)"),
          search: z.string().optional().describe("Filter lines containing this substring"),
        },
      },
      async ({ lines, search }) => {
        if (!this.callbacks.readAppLog) {
          return textResult({ error: "App log not available" });
        }
        const log = await this.callbacks.readAppLog(lines, search);
        return textResult({ log });
      },
    );
  }

  private registerScreenshotTool(server: McpServer): void {
    server.registerTool(
      "capture_screenshot",
      { description: "Capture a screenshot of the current application window" },
      async () => {
        if (!this.callbacks.captureScreenshot) {
          return textResult({ error: "Screenshot not available (no desktop integration)" });
        }
        const base64Png = await this.callbacks.captureScreenshot();
        return {
          content: [{ type: "image" as const, data: base64Png, mimeType: "image/png" }],
        };
      },
    );
  }

  private registerUIInteractionTools(server: McpServer): void {
    server.registerTool(
      "click",
      {
        description: "Click at coordinates (x, y) in the application window. Use capture_screenshot to find element positions.",
        inputSchema: {
          x: z.number().describe("X coordinate"),
          y: z.number().describe("Y coordinate"),
          doubleClick: z.boolean().optional().describe("Double click"),
        },
      },
      async ({ x, y, doubleClick }) => {
        if (!this.callbacks.sendInputEvent) {
          return textResult({ error: "UI interaction not available" });
        }
        const clickCount = doubleClick ? 2 : 1;
        await this.callbacks.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount });
        await this.callbacks.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount });
        return textResult({ ok: true });
      },
    );

    server.registerTool(
      "type_text",
      {
        description: "Type text into the currently focused element",
        inputSchema: {
          text: z.string().describe("Text to type"),
        },
      },
      async ({ text }) => {
        if (!this.callbacks.sendInputEvent) {
          return textResult({ error: "UI interaction not available" });
        }
        for (const char of text) {
          await this.callbacks.sendInputEvent({ type: "keyDown", keyCode: char });
          await this.callbacks.sendInputEvent({ type: "char", keyCode: char });
          await this.callbacks.sendInputEvent({ type: "keyUp", keyCode: char });
        }
        return textResult({ ok: true });
      },
    );

    server.registerTool(
      "press_key",
      {
        description: "Press a keyboard key (Enter, Tab, Escape, Backspace, ArrowDown, ArrowUp, etc.)",
        inputSchema: {
          key: z.string().describe("Key name (e.g. 'Enter', 'Tab', 'Escape', 'Backspace', 'ArrowDown')"),
          modifiers: z
            .array(z.enum(["shift", "control", "alt", "meta"]))
            .optional()
            .describe("Modifier keys to hold"),
        },
      },
      async ({ key, modifiers }) => {
        if (!this.callbacks.sendInputEvent) {
          return textResult({ error: "UI interaction not available" });
        }
        await this.callbacks.sendInputEvent({
          type: "keyDown",
          keyCode: key,
          ...(modifiers && {
            shift: modifiers.includes("shift"),
            control: modifiers.includes("control"),
            alt: modifiers.includes("alt"),
            meta: modifiers.includes("meta"),
          }),
        });
        await this.callbacks.sendInputEvent({
          type: "keyUp",
          keyCode: key,
          ...(modifiers && {
            shift: modifiers.includes("shift"),
            control: modifiers.includes("control"),
            alt: modifiers.includes("alt"),
            meta: modifiers.includes("meta"),
          }),
        });
        return textResult({ ok: true });
      },
    );

    server.registerTool(
      "scroll",
      {
        description: "Scroll the page at a given position",
        inputSchema: {
          x: z.number().describe("X coordinate to scroll at"),
          y: z.number().describe("Y coordinate to scroll at"),
          deltaX: z.number().optional().default(0).describe("Horizontal scroll amount"),
          deltaY: z.number().describe("Vertical scroll amount (negative = up, positive = down)"),
        },
      },
      async ({ x, y, deltaX, deltaY }) => {
        if (!this.callbacks.sendInputEvent) {
          return textResult({ error: "UI interaction not available" });
        }
        await this.callbacks.sendInputEvent({
          type: "mouseWheel",
          x,
          y,
          deltaX: deltaX ?? 0,
          deltaY,
        });
        return textResult({ ok: true });
      },
    );

    server.registerTool(
      "execute_js",
      {
        description: "Execute JavaScript in the renderer process and return the result. Useful for querying DOM, reading text, or complex interactions.",
        inputSchema: {
          code: z.string().describe("JavaScript code to execute"),
        },
      },
      async ({ code }) => {
        if (!this.callbacks.executeJavaScript) {
          return textResult({ error: "JS execution not available" });
        }
        const result = await this.callbacks.executeJavaScript(code);
        return textResult(result);
      },
    );
  }
}
