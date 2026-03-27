---
name: mcp-desktop-testing
description: Testing and interacting with the Platforma desktop app via MCP tools. Covers screenshot capture, UI clicks, coordinate systems, WebContents routing, and the rebuild/restart workflow.
---

# MCP desktop app testing

Guide for interacting with the Platforma desktop app through MCP tools (`mcp__pl__*`).

## Architecture: Electron window layers

The desktop app uses multiple `WebContentsView` layers inside a single `BrowserWindow`:

| Layer | What it renders | WebContents |
|-------|----------------|-------------|
| **Main window** | Top bar, left sidebar (block list, "Add Block") | `getMainWindowOrThrow().webContents` |
| **Block view** | Right panel — block UI (tables, forms, plots) | `this.blockView.webContents` |
| **Modals** | Overlays like "Add Block" modal | `this.modals` set entries |

`getTopmostWebContents()` returns: modal > blockView > main window (in priority order).

### Key source files

- Window management: `core/platforma-desktop-app/packages/main/src/windows.ts`
- MCP bridge (main process): `core/platforma-desktop-app/packages/main/src/WorkerManager.ts`
- MCP server tools: `core/platforma/lib/node/pl-mcp-server/src/tools/`
- MCP server callbacks: `core/platforma/lib/node/pl-mcp-server/src/server.ts`

## Coordinate system

Screenshots use **device pixels** (Retina 2x). Input events (`sendInputEvent`) use **CSS pixels**.

- macOS Retina: device pixels = CSS pixels * 2
- To convert screenshot coordinates to click coordinates: **divide by `devicePixelRatio`**
- Get the ratio: `execute_js` with `window.devicePixelRatio`

**Preferred method:** Use `execute_js` with `getBoundingClientRect()` to get CSS-pixel coordinates directly, avoiding manual conversion. This only works for elements in the webContents that `execute_js` targets (currently `getTopmostWebContents()`).

## Screenshot capture

`capture_screenshot` uses `desktopCapturer.getSources()` for full composited window capture (including modals and block views). Falls back to `getTopmostWebContents().capturePage()` if Screen Recording permission is not granted on macOS.

- `savePath` parameter: optional, saves PNG to disk in addition to returning inline
- `desktopCapturer` requires **Screen Recording** permission in macOS System Settings > Privacy & Security
- Without permission: falls back to single-WebContents capture (may miss overlays)

## Click routing

`sendInputEvent` uses `resolveWebContentsForEvent()` which routes mouse events based on coordinates:

1. Check if coordinates fall within modal bounds → modal webContents
2. Check if coordinates fall within block view bounds → block webContents
3. Otherwise → main window webContents

This means sidebar clicks (left of block view) correctly reach the main renderer.

**Keyboard events** (no x/y) always go to `getTopmostWebContents()`.

## execute_js routing

`execute_js` runs in `getTopmostWebContents()` — typically the block view when a block is selected. It **cannot** query DOM elements in the main window (sidebar, top bar) when a block view is active.

To interact with main window elements, use coordinate-based clicks instead.

## Rebuild and restart workflow

When modifying MCP server code or desktop app main process:

### MCP server changes (`core/platforma/lib/node/pl-mcp-server/`)

```bash
# 1. Build the package
cd core/platforma
pnpm --filter @milaboratories/pl-mcp-server build

# 2. Pack for desktop app consumption
pnpm --filter @milaboratories/pl-mcp-server do-pack

# 3. Reinstall in desktop app
cd core/platforma-desktop-app
pnpm install  # picks up new package.tgz

# 4. Rebuild worker (consumes pl-mcp-server)
pnpm --filter worker build

# 5. Full build and restart (see below)
```

### Desktop app changes (`core/platforma-desktop-app/packages/main/`)

```bash
cd core/platforma-desktop-app

# Build just main package (fast)
pnpm --filter main build

# Or full build (includes renderer, slower)
pnpm build
```

### Restart the app

```bash
# Kill running instance
kill $(pgrep -f "Electron\.app/Contents/MacOS/Electron \." | head -1)

# Wait and relaunch
sleep 2
cd core/platforma-desktop-app
nohup npm exec electron . > /tmp/platforma-app.log 2>&1 &

# Verify startup
sleep 6
tail -5 /tmp/platforma-app.log
# Look for: "MCP server started on port 4200"
```

### After restart

1. Reconnect MCP in Claude Code: `/mcp` → reconnect to `pl`
2. Reconnect to server: `connect_to_server` with saved credentials
3. Reopen project if needed: `open_project`

## Common test workflow

```
1. capture_screenshot          → see current state
2. click at (x, y)            → interact with UI
3. capture_screenshot          → verify result
4. Save with savePath param   → persist to disk for comparison
```

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Screenshot shows only block panel | Using `webContents.capturePage()` on block view | Use `desktopCapturer` (needs Screen Recording permission) |
| Screenshot is empty (0 bytes) | `desktopCapturer` failed, no fallback | Grant Screen Recording permission, or ensure fallback to `capturePage()` |
| Click doesn't hit sidebar | Input routed to block view webContents | Use `resolveWebContentsForEvent()` which checks bounds |
| `execute_js` can't find element | Element is in main window, not block view | Use click with coordinates instead |
| `pnpm install` doesn't update tgz | Cached resolution | Remove `node_modules/.pnpm/@milaboratories+pl-mcp-server*` then reinstall |
| App crashes after `pnpm install --force` | Lockfile changed, dependency version mismatch | Restore lockfile with `git checkout pnpm-lock.yaml`, then `pnpm install` |
| MCP tools unavailable after restart | Server not reconnected | Run `/mcp` in Claude Code to reconnect |
