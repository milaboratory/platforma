import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { type MiddleLayer, resourceIdToString } from "@milaboratories/pl-middle-layer";
import type { ToolContext } from "./tools/types";
import { registerPingTool } from "./tools/ping";
import { registerConnectionTools } from "./tools/connection";
import { registerProjectTools } from "./tools/projects";
import { registerBlockTools } from "./tools/blocks";
import { registerBlockStateTools } from "./tools/block-state";
import { registerAwaitTools } from "./tools/await";
import { registerLogTools } from "./tools/logs";
import { registerDataQueryTools } from "./tools/data-query";
import { registerScreenshotTool } from "./tools/screenshot";
import { registerUIInteractionTools } from "./tools/ui-interaction";

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
  /** List saved server connections. */
  listConnections?: () => Promise<ServerConnection[]>;
  /** Connect to a server. */
  connectToServer?: (
    addr: string,
    login: string,
    password?: string,
  ) => Promise<{ status: string; message: string }>;
  /** Get current connection status. */
  getConnectionStatus?: () => Promise<{
    connected: boolean;
    type?: string;
    addr?: string;
    login?: string;
  }>;
  /** Disconnect from current server. */
  disconnect?: () => Promise<void>;
  /** Get detailed info about a specific block package. */
  getBlockInfo?: (
    registryUrl: string,
    organization: string,
    name: string,
    version: string,
  ) => Promise<unknown>;
}

export interface ServerConnection {
  addr: string;
  login: string;
  coreVersion?: string;
  lastConnected?: string;
}

export interface PlMcpServerOptions {
  /** MiddleLayer instance providing access to projects, blocks, etc. Optional — server can start without it. */
  middleLayer?: MiddleLayer;
  /** Port to listen on. */
  port: number;
  /** Secret path segment for URL security. */
  secret: string;
  /** Optional callbacks for project lifecycle events (e.g. to sync UI state). */
  callbacks?: PlMcpServerCallbacks;
}

export class PlMcpServer {
  private ml: MiddleLayer | undefined;
  private port: number;
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

  /** Set or update the MiddleLayer instance (e.g. after connecting to a server). */
  setMiddleLayer(ml: MiddleLayer | undefined) {
    this.ml = ml;
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
      try {
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
        const existingTransport = sessionId ? this.transports.get(sessionId) : undefined;
        if (existingTransport) {
          await existingTransport.handleRequest(req, res);
          return;
        }

        if (req.method === "POST") {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });

          let closed = false;
          transport.onclose = () => {
            closed = true;
            const sid = transport.sessionId;
            if (sid) this.transports.delete(sid);
          };

          const server = this.createMcpServer();
          await server.connect(transport);
          await transport.handleRequest(req, res);

          // Store after handleRequest so sessionId is assigned.
          // Guard against storing an already-closed transport (race condition).
          const sid = transport.sessionId;
          if (sid && !closed) this.transports.set(sid, transport);
          return;
        }

        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Bad Request: no valid session" }));
      } catch {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
      }
    });

    const maxRetries = 10;
    const requestHandler = this.httpServer.listeners("request")[0] as (
      req: IncomingMessage,
      res: ServerResponse,
    ) => void;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const server = this.httpServer;
      try {
        await new Promise<void>((resolve, reject) => {
          server.listen(this.port, "127.0.0.1", () => resolve());
          server.once("error", reject);
        });
        return;
      } catch (err: unknown) {
        if ((err as { code?: string }).code === "EADDRINUSE" && attempt < maxRetries - 1) {
          server.removeAllListeners();
          this.httpServer = createServer(requestHandler);
          this.port++;
          continue;
        }
        throw err;
      }
    }
  }

  async stop(): Promise<void> {
    for (const transport of this.transports.values()) {
      await transport.close();
    }
    this.transports.clear();

    const server = this.httpServer;
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      this.httpServer = undefined;
    }
  }

  private createMcpServer(): McpServer {
    const sessionId = randomUUID().slice(0, 8);
    const server = new McpServer(
      { name: "platforma", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );
    this.registerTools(server, sessionId);
    return server;
  }

  private registerTools(server: McpServer, sessionId: string): void {
    const authorId = `mcp-${sessionId}`;
    let localVersion = 0;
    const ctx: ToolContext = {
      getMl: () => this.ml,
      requireMl: () => this.requireMl(),
      resolveProject: (id) => this.resolveProject(id),
      getOpenedProject: (id) => this.getOpenedProject(id),
      callbacks: this.callbacks,
      getAuthorMarker: () => ({ authorId, localVersion: ++localVersion }),
    };
    registerPingTool(server, ctx);
    registerConnectionTools(server, ctx);
    registerProjectTools(server, ctx);
    registerBlockTools(server, ctx);
    registerBlockStateTools(server, ctx);
    registerAwaitTools(server, ctx);
    registerLogTools(server, ctx);
    registerDataQueryTools(server, ctx);
    registerScreenshotTool(server, ctx);
    registerUIInteractionTools(server, ctx);
  }

  /** Throws if MiddleLayer is not available (not connected to a server). */
  private requireMl(): MiddleLayer {
    if (!this.ml) throw new Error("Not connected to a server. Use connect_to_server first.");
    return this.ml;
  }

  /** Resolves a project from the list by its projectId (resourceIdToString format). */
  private async resolveProject(projectId: string) {
    const ml = this.requireMl();
    await ml.projectList.refreshState();
    const projects = await ml.projectList.awaitStableValue();
    const entry = projects.find((p) => resourceIdToString(p.rid) === projectId);
    if (!entry) throw new Error(`Project ${projectId} not found`);
    return entry;
  }

  /** Gets an opened project by projectId. Resolves via project list → rid → getOpenedProject. */
  private async getOpenedProject(projectId: string) {
    const ml = this.requireMl();
    const entry = await this.resolveProject(projectId);
    return ml.getOpenedProject(entry.rid);
  }
}
