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
  private mcpServer: McpServer | undefined;
  private transport: StreamableHTTPServerTransport | undefined;

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

    this.mcpServer = new McpServer(
      { name: "platforma", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );

    this.registerTools(this.mcpServer);

    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    await this.mcpServer.connect(this.transport);

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

      await this.transport!.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(this.port, "127.0.0.1", () => resolve());
      this.httpServer!.once("error", reject);
    });
  }

  async stop(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = undefined;
    }
    if (this.mcpServer) {
      await this.mcpServer.close();
      this.mcpServer = undefined;
    }
    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => (err ? reject(err) : resolve()));
      });
      this.httpServer = undefined;
    }
  }

  private registerTools(server: McpServer): void {
    server.registerTool("ping", { description: "Health check" }, async () => {
      return {
        content: [{ type: "text", text: JSON.stringify({ status: "ok" }) }],
      };
    });
  }
}
