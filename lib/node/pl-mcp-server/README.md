# Platforma MCP Server

MCP (Model Context Protocol) server that enables AI assistants to interact with the Platforma Desktop App. It exposes tools for project management, block control, UI interaction, screenshot capture, and data queries through the standardized MCP interface.

## Capabilities

| Tool group         | What it does                                                     |
| ------------------ | ---------------------------------------------------------------- |
| **Connection**     | Connect/disconnect to a running Platforma backend server         |
| **Projects**       | List, open, and manage projects                                  |
| **Blocks**         | Add blocks, read block state, configure inputs/arguments         |
| **UI interaction** | Click, type, scroll, and send keyboard events to the desktop app |
| **Screenshots**    | Capture window screenshots (full composited or per-WebContents)  |
| **Data query**     | Query PColumn data and result pool contents                      |
| **Logs**           | Retrieve application logs                                        |
| **Sandbox**        | Execute JavaScript in the app's renderer process                 |

## How It Works

The MCP server runs as a worker process inside the Platforma Desktop App (Electron). It communicates with the main process via IPC and exposes tools over the MCP protocol (stdio transport by default, HTTP also supported).

```
Claude Code  ──MCP──▶  pl-mcp-server (worker)  ──IPC──▶  Desktop App (main process)
                                                           ├── Main window
                                                           ├── Block view
                                                           └── Modals
```

## Connecting From Claude Code

1. **Start the Platforma Desktop App and enable MCP** — the MCP server feature marked as Alpha for now. To enable it open Settings, scroll down to the bottom, enable checkbox "Enable MCP Server". Then copy MCP Server URL.

2. **Add the MCP server to Claude Code** by creating or editing `.claude/settings.json`:

   ```json
   {
     "mcpServers": {
       "pl": {
         "type": "sse",
         "url": "http://localhost:4200/mcp"
       }
     }
   }
   ```

3. **Verify the connection** — run `/mcp` in Claude Code to see the `pl` server status. All tools will be available as `mcp__pl__*`.

4. **Connect to the backend** — use `list_connections` to see already saved connections. You could easily reuse them. Or call `connect_to_server` directly with URL, username and password to create new connection.

5. **Open a project** — use `open_project` to start working with a specific project.

## Skill

There is a `mcp-desktop-testing` skill for Claude in ecosystem overlay. Should be found and used automatically if overlay enabled.

## Coordinate System

The desktop app uses Electron with potentially multiple WebContents layers. Screenshots are captured in **device pixels** (2x on Retina displays), while input events use **CSS pixels**.

To click on an element visible in a screenshot: divide the screenshot pixel coordinates by the device pixel ratio (typically 2 on macOS Retina).

## Development

```bash
# Build
pnpm --filter @milaboratories/pl-mcp-server build

# Run tests
pnpm --filter @milaboratories/pl-mcp-server test

# Pack for desktop app
pnpm --filter @milaboratories/pl-mcp-server do-pack

# Then reinstall in desktop app
cd ../../platforma-desktop-app && pnpm install
```

After changes, rebuild the desktop app's worker package and restart the app to pick up the new server code.
