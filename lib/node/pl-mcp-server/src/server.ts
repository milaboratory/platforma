import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { MiddleLayer } from "@milaboratories/pl-middle-layer";

export interface PlMcpServerOptions {
  /** MiddleLayer instance providing access to projects, blocks, etc. */
  middleLayer: MiddleLayer;
  /** Port to listen on. */
  port: number;
  /** Secret path segment for URL security. */
  secret: string;
}

export class PlMcpServer {
  private readonly ml: MiddleLayer;
  private readonly port: number;
  private readonly secret: string;
  private httpServer: Server | undefined;
  private readonly transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(options: PlMcpServerOptions) {
    this.ml = options.middleLayer;
    this.port = options.port;
    this.secret = options.secret;
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
      // Validate Origin header per MCP spec
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

      // Validate path — must match /{secret}/mcp exactly
      if (req.url !== expectedPath) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found" }));
        return;
      }

      // Route to existing session or create new one for initialization
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId && this.transports.has(sessionId)) {
        await this.transports.get(sessionId)!.handleRequest(req, res);
        return;
      }

      // New session — only allowed for POST (initialization)
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

      // Unknown session for non-POST
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
    server.registerTool("ping", { description: "Health check" }, async () => {
      return {
        content: [{ type: "text", text: JSON.stringify({ status: "ok" }) }],
      };
    });
  }
}
