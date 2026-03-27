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

- macOS Retina: device pixels = CSS pixels × 2
- To convert screenshot coordinates to click coordinates: **divide by `devicePixelRatio`** (typically 2)
- Get the ratio: `execute_js` with `window.devicePixelRatio`, or check screenshot dimensions (2880×1800 = 2x of 1440×900)

### How to find click coordinates from screenshots

1. **Take a screenshot** with `capture_screenshot` (use `savePath` to save to disk)
2. **Identify the target element** in the screenshot image
3. **Estimate device-pixel coordinates** of the element's center in the image
4. **Divide by DPR** (typically 2) to get CSS-pixel coordinates for `click`

Example: if a button center is at (200, 1460) in the screenshot image → click at CSS (100, 730).

### Practical tips

- Screenshot images are 2880×1800 pixels for a 1440×900 CSS-pixel window (DPR=2)
- When eyeballing coordinates, err toward the center of the target element
- The sidebar is 280 CSS pixels wide; its center is at x≈140
- The title bar is 40 CSS pixels tall
- If a click misses, adjust by ±10 CSS pixels and retry
- `execute_js` with `getBoundingClientRect()` gives exact CSS coordinates, but only works for elements in the topmost WebContents (block view when a block is selected, main window otherwise)

## Screenshot capture

`capture_screenshot` uses `desktopCapturer.getSources()` for full composited window capture (including modals and block views). Falls back to `getTopmostWebContents().capturePage()` if Screen Recording permission is not granted on macOS.

- `savePath` parameter: optional, saves PNG to disk in addition to returning inline
- `desktopCapturer` requires **Screen Recording** permission in macOS System Settings > Privacy & Security
- Without permission: falls back to single-WebContents capture (may miss overlays)
- `desktopCapturer` can be **intermittent** — it may work for some captures and fail for others within the same session. If a screenshot shows only the block view (no sidebar/title bar), retry — the next capture may succeed
- When the screenshot shows only the block view content (no sidebar), you can still click sidebar elements by calculating coordinates from the known layout (sidebar=280px, title bar=40px)

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
1. capture_screenshot (savePath)  → see current state, get device-pixel coordinates
2. Divide coordinates by DPR (2) → convert to CSS pixels
3. click at (cssX, cssY)         → interact with UI
4. sleep 1-2s                    → wait for UI to react
5. capture_screenshot (savePath)  → verify result
```

### Window layout reference

```
┌──────────────────────────────────────────────┐
│  Title bar (y: 0–40 CSS)                     │
├───────────┬──────────────────────────────────┤
│  Sidebar  │  Block view                      │
│  (x: 0–   │  (x: 280–1440, y: 40–900 CSS)   │
│   280 CSS)│                                  │
│           │                                  │
│  Block    │                                  │
│  list     │                                  │
│           │                                  │
│ ┌───────┐ │                                  │
│ │+ Add  │ │                                  │
│ │ Block │ │                                  │
│ └───────┘ │                                  │
└───────────┴──────────────────────────────────┘
```

- Sidebar width: **280 CSS pixels** (can be hidden via toggle in title bar)
- Title bar height: **40 CSS pixels**
- Block view: fills remaining space (typically 1160×860 CSS pixels)
- "Add Block" button: sidebar footer, approximately x≈100, y≈730–740 CSS (varies with block count)

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Screenshot shows only block panel | `desktopCapturer` failed, fell back to `capturePage()` on block view | Grant Screen Recording permission, or retry — `desktopCapturer` is intermittent |
| Screenshot is empty (0 bytes) | Block view not fully loaded yet | Wait 2-3 seconds and retry |
| Click doesn't hit target | Wrong coordinate conversion | Verify: screenshot pixel ÷ 2 = CSS pixel. Check screenshot dimensions with `sips -g pixelWidth -g pixelHeight` |
| Click hits wrong element | Coordinate slightly off | Adjust by ±10 CSS pixels. Use `savePath` to save screenshot and measure precisely |
| `execute_js` can't find element | Element is in main window, not block view | Use coordinate-based click instead. `execute_js` targets topmost WebContents only |
| Sidebar click ignored | Sidebar may be hidden (`margin-left: -280px`) | Toggle sidebar via title bar icon at approximately CSS (67, 9) |
| `pnpm install` doesn't update tgz | Cached resolution | Remove `node_modules/.pnpm/@milaboratories+pl-mcp-server*` then reinstall |
| App crashes after `pnpm install --force` | Lockfile changed, dependency version mismatch | Restore lockfile with `git checkout pnpm-lock.yaml`, then `pnpm install` |
| MCP tools unavailable after restart | Server not reconnected | Run `/mcp` in Claude Code to reconnect |
