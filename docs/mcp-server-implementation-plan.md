# MCP server implementation plan

## Architecture decision

New package: `lib/node/pl-mcp-server/` in the platforma monorepo.

**Why here and not in desktop-app?**
- The server wraps `MiddleLayer` — same layer as existing APIs (workerApi, v3Api, pFrameApi)
- Testable without Electron — uses `withMl` pattern from `tests/drivers-ml-blocks-integration/`
- Desktop-app will import and start it in the worker thread, passing its `MiddleLayer` instance
- Screenshot and UI navigation are desktop-specific — injected via callback interface

**Transport:** Streamable HTTP via `@modelcontextprotocol/sdk` on `http://localhost:{port}/{secret}/mcp`.

**Dependencies:**
- `@modelcontextprotocol/sdk` (v1.x) — MCP protocol implementation
- `@milaboratories/pl-middle-layer` — MiddleLayer, Project
- `@milaboratories/computable` — Computable, awaitStableValue
- `@milaboratories/pl-model-middle-layer` — ProjectOverview, BlockStateInternalV3, AuthorMarker

---

## Steps (MVP-first, each step testable in desktop app)

### Step 1: Package scaffold + MCP server skeleton

Create `lib/node/pl-mcp-server/` with:
- `package.json` (deps: `@modelcontextprotocol/sdk`, `@milaboratories/pl-middle-layer`)
- `tsconfig.json` (extends shared config)
- `src/index.ts` — exports `PlMcpServer` class
- `src/server.ts` — `PlMcpServer`:
  - Constructor takes `{ middleLayer: MiddleLayer, port: number, secret: string }`
  - `start()` — creates `McpServer`, sets up Streamable HTTP transport on `http://localhost:{port}/{secret}/mcp`
  - `stop()` — shuts down HTTP server
  - Secret path validation: requests to wrong paths get 404
  - Binds to `127.0.0.1`
  - Origin header validation per MCP spec
- Register one dummy tool `ping` that returns `{ status: "ok" }` — proves end-to-end connectivity

**Test:** `tests/mcp-server/` — integration test:
1. Start MiddleLayer via `withMl` pattern
2. Start `PlMcpServer` on a random free port
3. Connect MCP client from `@modelcontextprotocol/sdk`
4. Call `ping` tool, assert response
5. Verify wrong secret returns 404
6. Verify wrong path returns 404
7. Stop server, stop MiddleLayer

**Files created:**
- `lib/node/pl-mcp-server/package.json`
- `lib/node/pl-mcp-server/tsconfig.json`
- `lib/node/pl-mcp-server/src/index.ts`
- `lib/node/pl-mcp-server/src/server.ts`
- `tests/mcp-server/package.json`
- `tests/mcp-server/vitest.config.ts`
- `tests/mcp-server/src/server.test.ts`
- `tests/mcp-server/src/with-mcp.ts` (helper: starts ML + MCP server + MCP client)

**Workspace changes:**
- Add `lib/node/pl-mcp-server` and `tests/mcp-server` to `pnpm-workspace.yaml`

**Exception:** this step is test-only (no desktop app yet).

---

### Step 2: Desktop integration — server startup + settings UI

Changes to `core/platforma-desktop-app/`:

1. **Add dependency** on `@milaboratories/pl-mcp-server`

2. **Settings types** (`packages/core/src/types/app.ts`):
   ```typescript
   mcpServer?: {
     enabled: boolean;  // default: false
     port: number;      // default: 4200
     secret: string;    // generated on first enable
   }
   ```

3. **Worker thread** (`packages/worker/src/index.ts`):
   - Import `PlMcpServer`
   - On `MiddleLayer` ready + MCP enabled: `server = new PlMcpServer({ middleLayer: ml, port, secret }); await server.start()`
   - On disconnect/disable: `await server.stop()`

4. **Settings UI** (`packages/renderer/`):
   - Add MCP section to settings page
   - Toggle, port input, read-only URL with copy button
   - "Alpha" label

**Desktop validation:** Enable MCP in settings, connect Claude Desktop (or any MCP client) to the URL, call `ping` tool — confirms the server is reachable.

**After this step:** every subsequent tool added to `pl-mcp-server` is immediately testable from the desktop app without any desktop-app changes.

---

### Step 3: Project CRUD tools

Register tools on the `McpServer` instance:
- `list_projects` → `ml.projectList` computable → await stable value → return list
- `create_project` → `ml.createProject({ label })` → return `{ projectId }`
- `open_project` → `ml.openProject(id)` → return `{ ok: true }`
- `close_project` → `ml.closeProject(rid)` → return `{ ok: true }`
- `delete_project` → `ml.deleteProject(id)` → return `{ ok: true }`

Each tool has Zod input schema validation via MCP SDK's built-in support.

Internal: maintain a `Map<string, { rid: ResourceId, project: Project }>` for opened projects lookup. Wrap `ml.getOpenedProject(rid)` for access.

**Test:** extend `tests/mcp-server/`:
- `projects.test.ts`:
  1. `create_project` → returns projectId
  2. `list_projects` → contains created project
  3. `open_project` → success
  4. `close_project` → success
  5. `delete_project` → success
  6. `list_projects` → empty
  7. Error cases: open non-existent, close already closed, delete while open

**Desktop validation:** Connect MCP client, create/list/delete projects — verify they appear in the desktop app's project list.

---

### Step 4: Block management tools (add, remove, run, stop)

Tools:
- `add_block` → `project.addBlock(label, blockPackSpec, undefined, marker)` → return `{ blockId }`
  - Input: `projectId`, `registryId` (e.g. `@platforma-open/milaboratories.enter-numbers-v3`), `version` (semver), optional `label`
  - Constructs `BlockPackSpecAny` from registry spec
- `remove_block` → `project.deleteBlock(blockId, marker)` → return `{ ok: true }`
- `run_block` → uses production graph to start execution (via `withProject` mutator pattern)
- `stop_block` → stops block execution
- `reorder_blocks` → `project.reorderBlocks(blockIds)`

AuthorMarker: per-session `authorId = "mcp-{sessionId}"`, incrementing `localVersion`.

**Test:** `blocks.test.ts`:
1. Create + open project
2. `add_block` with `enter-numbers-v3` test block (from `etc/blocks/`)
3. Verify block appears in project
4. `remove_block` → verify gone
5. Add block again, configure via `set_block_data` (Step 5), run, verify status changes
6. Error cases: add to closed project, remove non-existent block

**Note:** Test blocks from `etc/blocks/` (enter-numbers-v3, sum-numbers-v3) are already built as part of the monorepo build. The existing integration tests use them via dev block paths — we do the same.

**Desktop validation:** Add/remove blocks via MCP, see them appear/disappear in the desktop app's project view. Run a block, see status change in the UI.

---

### Step 5: Block state read + write tools

Tools:
- `get_project_overview` → `project.overview` computable → await value → return overview
  - Returns: blocks with id, title, calculationStatus, canRun, stale, errors, upstream/downstream
- `get_block_state` → `project.getBlockState(blockId)` → await stable → return `__data` field
- `get_block_status` → extract from overview: calculationStatus, stale, canRun, inputsValid, errors
- `set_block_data` → `project.mutateBlockStorage(blockId, { operation: "update-data", value: data }, marker)`

**Test:** `state.test.ts`:
1. Create project, add `enter-numbers-v3` block
2. `get_block_state` → returns initial state
3. `set_block_data` with `{ numbers: [1, 2, 3] }` → success
4. `get_block_state` → returns updated data
5. `get_project_overview` → shows block with correct status
6. `get_block_status` → returns status fields
7. Error cases: get state of non-existent block, set invalid data

**Desktop validation:** Set block data via MCP, open the block in desktop — verify the UI shows the configured values. Read state back via MCP, confirm it matches what the UI shows.

---

### Step 6: Await + run full pipeline — DONE

Tools:
- `await_block_done` → two-phase wait: first polls `project.overview` until `calculationStatus` reaches `"Done"` or error, then calls `project.getBlockState(blockId).awaitStableValue()` to ensure outputs are fully materialized
  - Input: `projectId`, `blockId`, `timeout` (default 120000ms)
  - Returns: `{ status, block, data, outputs }` on success, or `{ timedOut: true, status }` on timeout
  - Phase 1 (production done): follows pattern from `sdk/test/src/test-block.ts:awaitBlockDone`
  - Phase 2 (outputs stable): waits for block state computable to settle so outputs are readable
  - Combined because callers rarely need the intermediate "done but not stable" state

**Test:** `pipeline.test.ts` — **the key e2e test proving the full automated loop**:
1. Create project
2. Add `enter-numbers-v3` block, add `sum-numbers-v3` block
3. `set_block_data` on enter-numbers with `{ numbers: [10, 20, 30] }`
4. Wire sum-numbers to use enter-numbers output (via `set_block_data` on sum-numbers)
5. `run_block` on sum-numbers (with `addUpstreams` so enter-numbers runs first)
6. `await_block_done` → waits for completion + stable outputs
7. `get_block_state` → verify final state has outputs
8. Timeout test: set very short timeout, verify `timedOut: true` response

**Desktop validation:** Run the full pipeline via MCP client while watching the desktop app — see blocks transition through NotCalculated → Running → Done states in real time.

---

### Step 7: Data query tools — SKIPPED (deferred)

Tools:
- `get_block_outputs` → rendered output values as JSON. PFrame/PTable handles → column specs + row count
- `query_table` → query PFrame/PTable output with columns, filters, sorting, offset, limit
  - Reuses `pFrameApi` logic (findColumns, calculateTableData)
- `list_columns` → column specs from PFrame output

This requires access to PFrame infrastructure. The `MiddleLayer` provides `driverKit` which includes PFrame factory. The server will need the same PFrame access that `pFrameApi.ts` in the worker thread uses.

**Test:** `data-query.test.ts`:
1. Build a pipeline that produces tabular output (use `table-test` block from `etc/blocks/`)
2. Run pipeline, await done + stable
3. `get_block_outputs` → verify outputs listed with column count
4. `list_columns` → verify column specs
5. `query_table` with default limit → verify row data
6. `query_table` with specific columns, offset, limit → verify pagination
7. Error: query on not-ready output

**Desktop validation:** Run a block that produces a table, then query it via MCP — compare results with what the desktop app's table view shows.

---

### Step 8: Logs tool — DONE

Tools:
- `get_block_logs` → reads execution logs for a block
  - Input: `projectId`, `blockId`, `lines` (default 100), `search` (regex filter)
  - Reuses `logsApi` patterns
- `get_app_log` → reads the Electron main process log (application-level diagnostics)
  - Input: `lines` (default 100), `search` (substring filter)
  - Reads from `~/Library/Logs/platforma/main.log` (macOS) or equivalent
  - Useful for debugging block loading errors, connection issues, MCP server problems

**Test:** `logs.test.ts` (deferred for `get_block_logs`, manual for `get_app_log`):
1. Run a block, await completion
2. `get_block_logs` → returns log text (deferred — needs log handle extraction)
3. `get_block_logs` with search filter → returns filtered lines (deferred)
4. `get_block_logs` on non-running block → returns available logs or empty (deferred)
5. `get_app_log` → returns recent app log entries
6. `get_app_log` with search "MCP" → returns MCP-related log lines

**Manual desktop testing for `get_app_log`:**

Prerequisites: desktop app running and connected to a backend, MCP server started.

```
# From Claude Code (after /mcp reconnect):
get_app_log lines=5
→ returns last 5 lines of main.log

get_app_log lines=10 search="error"
→ returns last 10 lines containing "error" (case-sensitive)

get_app_log lines=5 search="MCP"
→ returns MCP-related log entries (server start, callbacks, etc.)
```

Verify:
- Output matches `~/Library/Logs/platforma/main.log` content (macOS)
- Search filter correctly narrows results
- Large `lines` values work without issues
- Tool returns error string (not crash) if log file is missing

Note: the MCP server only starts after the app connects to a backend. If the app just launched and hasn't connected yet, the MCP URL won't be reachable.

---

### Step 9: Registry search tools -- SKIPPED

Tools:
- `search_blocks` → queries block registries via `ml.blockRegistryProvider`
  - Input: `query` (text), optional `category`
  - Returns: block packages with id, version, title, description
- `get_block_info` → detailed info about a block package
  - Input: `registryId`, `version`
  - Returns: description, inputs, outputs, channels

**Test:** `registry.test.ts`:
1. `search_blocks` with query matching test blocks → returns results
2. `get_block_info` for a known block → returns details
3. `search_blocks` with no results → empty list

**Desktop validation:** Search for a block via MCP, verify results match what the desktop app's block library shows.

---

### Step 10: Screenshot, UI interaction + block navigation (desktop-specific) — DONE

Implemented tools:
- `select_block` → navigates desktop UI to display specified block (sets project route via store)
- `capture_screenshot` → captures the topmost visible view (modal > blockView > main) as base64 PNG
- `click` → click at CSS coordinates in the topmost view
- `type_text` → type text into the focused element
- `press_key` → press keyboard keys with optional modifiers (shift, ctrl, alt, meta)
- `scroll` → scroll at a given position
- `execute_js` → run JavaScript in the topmost view's renderer process

**Implementation:**
- `PlMcpServerCallbacks` interface with: `captureScreenshot`, `sendInputEvent`, `executeJavaScript`, `selectBlock`
- Worker forwards callbacks to main process via `invokeParentMethod`
- Main process routes through `Windows.getTopmostWebContents()` which checks: top modal → blockView → main webContents
- `selectBlock` uses `store.commit("setProjectRoute", projectId, { blockId })` — the renderer's reactive route watcher loads the block frontend automatically
- Screenshot captures the correct view even when block UIs or modals are open

**Key implementation details:**
- Electron's `capturePage()` only captures a single `WebContentsView`, not composited child views. The server captures whichever view is topmost.
- `sendInputEvent` uses CSS-pixel coordinates (not device pixels). Use `execute_js` + `getBoundingClientRect()` to find element positions.
- Block modals (e.g. file import dialogs) render inside the blockView, not as separate modal WebContentsViews.

---

## What's NOT in this plan (deferred per spec)

- `invoke_action` prototype — depends on action system readiness
- Kind-enhanced tools (`add_block_by_kind`, `get_kind_schema`, etc.) — deferred to kind packages
- Remote MCP access
- MCP prompts/sampling primitives
- File upload through MCP

---

## Spec compliance

Comparison of the [Platforma MCP Server spec](https://github.com/milaboratory/text/pull/60) (commit `3378092`) against the implementation in `lib/node/pl-mcp-server/` and tests in `tests/mcp-server/`.

---

### Not implemented

| Req | Spec tool | Notes |
|-----|-----------|-------|
| R15 | `reorder_blocks` | Not implemented at all |
| R19 | `get_block_outputs` | Deferred (PFrame output rendering) |
| R20 | `get_block_status` | No separate tool; status fields are embedded in `get_project_overview` response |
| R22 | `invoke_action` | Not implemented (action system prototype) |
| R23 | `AuthorMarker` on mutations | `set_block_data` does not pass per-session `authorId: "mcp-{sessionId}"` or incrementing `localVersion` |
| R25 | `await_stable` | No separate tool; merged into `await_block_done` as a two-phase wait (see "Implemented differently" below) |
| R27 | `query_table` | Deferred (PFrame query) |
| R28 | `list_columns` | Deferred (PFrame column listing) |
| R31 | `get_block_info` | Deferred (detailed block package info from registry) |

---

### Implemented differently

| Req | Spec says | Implementation does |
|-----|-----------|---------------------|
| R4 | Server starts when (a) MCP enabled AND (b) app connects to backend. Stops on disconnect. | Server can start without a MiddleLayer. ML is optional and set later via `setMiddleLayer()`. Tools that need ML check at call time and return an error if not connected. |
| R11 | `add_block` takes `registryId` (string) + `version` (semver string) | Takes a full `spec` union object: either `{ type: "from-registry-v2", registryUrl, id: { organization, name, version } }` or `{ type: "dev-v2", folder }`. More flexible but different API surface. |
| R13 | `run_block` uses explicit `addUpstreams` flag in the production graph | `project.runBlock(blockId)` auto-starts stale upstream blocks. No flag exposed to the MCP caller. |
| R16 | Tool named `open_block` | Named `select_block` |
| R17 | `get_project_overview` returns `subtitle` among block fields | Implementation returns `title` but no `subtitle` field. Returns `inputsValid` which is not in the spec. |
| R25 | `await_stable` is a separate tool (blocks until computable is stable, returns stable state) | Merged into `await_block_done` as phase 2: after `calculationStatus` reaches Done, it additionally calls `awaitStableValue()` on block state. No way to call `await_stable` independently. |
| R26 | Single `get_logs` tool with regex `search` filter, returns log text with byte offset for pagination | Split into two tools: `get_block_logs` (reads logs from block outputs, keyed by sample/run ID) + `get_app_log` (reads Electron main process log). Search is substring match, not regex. No byte offset for pagination. `get_block_logs` has a `sampleId` filter parameter not in spec. |
| R29 | `capture_screenshot` returns error if no block is currently open | Captures the topmost visible view (modal > blockView > main) — works even without a block open. No error when no block is displayed. |
| R30 | `search_blocks` takes `query` (text) + optional `category`. Returns packages with id, version, title, description, organization. | Named `list_available_blocks`. Takes optional `query` only (case-insensitive substring match on name). No `category` parameter. Delegates to a callback rather than querying registries directly. |

---

### Implemented beyond spec

These tools exist in the implementation but are not mentioned in the spec:

| Tool | Category | Description |
|------|----------|-------------|
| `ping` | Infrastructure | Health check, returns `{ status: "ok", connected: boolean }` |
| `get_connection_status` | Connection | Returns current backend connection status (connected, type, addr, login) |
| `list_connections` | Connection | Lists saved server connections |
| `connect_to_server` | Connection | Connect to a Platforma backend server by address + login |
| `disconnect` | Connection | Disconnect from current backend server |
| `click` | UI interaction | Click at CSS coordinates in the application window |
| `type_text` | UI interaction | Type text into the currently focused element |
| `press_key` | UI interaction | Press keyboard keys with optional modifiers (shift, ctrl, alt, meta) |
| `scroll` | UI interaction | Scroll at a given position in the window |
| `execute_js` | UI interaction | Execute JavaScript in the renderer process, return result |
| `get_app_log` | Logs | Read Electron main process log (split from spec's single `get_logs`) |

The connection management tools (`get_connection_status`, `list_connections`, `connect_to_server`, `disconnect`) enable MCP clients to manage the backend connection lifecycle, which the spec assumes is handled entirely through the Desktop UI.

The UI interaction tools (`click`, `type_text`, `press_key`, `scroll`, `execute_js`) enable AI-driven UI automation — the spec only mentions `capture_screenshot` for visual verification and defers "Block UI interaction via PuppetCommand through MCP" to future work.

---

### Test coverage gaps

Comparing spec acceptance criteria against actual test files in `tests/mcp-server/src/`:

| Spec expectation | Test status |
|------------------|-------------|
| Wrong secret → 404 | Covered (`server.test.ts`) |
| Wrong path → 404 | Covered (`server.test.ts`) |
| Create, list, open, close, delete project lifecycle | Covered (`projects.test.ts`) |
| Error: open non-existent project | Not tested |
| Error: close already-closed project | Not tested |
| Error: delete while open | Not tested |
| Add and remove block | Covered (`blocks.test.ts`) |
| Error: add block to closed project | Not tested |
| Error: remove non-existent block | Not tested |
| `get_project_overview` returns block info | Covered (`state.test.ts`) |
| `set_block_data` + `get_block_state` roundtrip | Covered (`state.test.ts`) |
| `await_block_done` waits for completion | Covered (`pipeline.test.ts`) |
| `await_block_done` timeout | Covered (`pipeline.test.ts`) |
| Full pipeline: add blocks → set data → wire → run → await → verify outputs | Not fully tested (pipeline test runs single block, no wiring between enter-numbers + sum-numbers) |
| `run_block` + verify status transitions | Not tested (run_block is used in pipeline test but status transitions aren't asserted) |
| `stop_block` | Not tested |
| `get_block_logs` | Not tested |
| `get_app_log` | Not tested |
| `capture_screenshot` | Not tested (requires desktop-app callbacks) |
| `select_block` | Not tested (requires desktop-app callbacks) |
| UI interaction tools (`click`, `type_text`, etc.) | Not tested (require desktop-app callbacks) |
| Connection tools (`connect_to_server`, etc.) | Not tested (require desktop-app callbacks) |
| `list_available_blocks` | Not tested (requires desktop-app callback) |
| Origin header validation → 403 | Not tested |
| Port auto-increment on EADDRINUSE | Not tested |

---

## Dependency graph

```
Step 1 (skeleton) ─ test only
  └─> Step 2 (desktop integration) ─ from here, every step testable in desktop app
        └─> Step 3 (project CRUD)
              └─> Step 4 (block management)
                    └─> Step 5 (state read/write)
                          └─> Step 6 (await + pipeline)
                                ├─> Step 7 (data query)
                                ├─> Step 8 (logs)
                                ├─> Step 9 (registry)
                                └─> Step 10 (screenshot + open_block)
```

Steps 7, 8, 9 are independent after Step 6 — can be parallelized.
Step 10 is independent after Step 6 but requires desktop-app changes.

---

## PR strategy

Two repositories affected:
- **`core/platforma/`** — Steps 1, 3-9 (pl-mcp-server package + tests)
- **`core/platforma-desktop-app/`** — Steps 2, 10 (worker startup, settings UI, screenshot IPC)

Approach: feature branch in each repo. PRs created after each meaningful milestone:
- PR1 (platforma): Steps 1+3+4+5 — server skeleton + project/block/state tools
- PR2 (desktop-app): Step 2 — desktop integration with settings UI
- PR3 (platforma): Step 6 — await + pipeline (the key e2e test)
- PR4 (platforma): Steps 7+8+9 — data query, logs, registry
- PR5 (desktop-app): Step 10 — screenshot support

---

## Test strategy

### Automated integration tests

All e2e tests in `tests/mcp-server/` use the same pattern:

```typescript
import { withMcpServer } from "./with-mcp";

test("test name", async () => {
  await withMcpServer(async (client) => {
    const result = await client.callTool({ name: "create_project", arguments: { label: "Test" } });
    expect(result).toMatchObject({ projectId: expect.any(String) });
  });
});
```

`withMcpServer` helper:
1. Creates MiddleLayer via `TestHelpers.withTempRoot` (same as existing integration tests)
2. Starts `PlMcpServer` on random free port with test secret
3. Creates MCP `Client` from `@modelcontextprotocol/sdk`, connects via Streamable HTTP
4. Passes client to test callback
5. Tears down: stop server, close MiddleLayer

Tests run as part of `pnpm test` via Turbo. Require `PL_ADDRESS` env (same as existing integration tests — they need a running PL backend).

### Desktop manual testing with UI interaction tools

The MCP server exposes UI interaction tools (`click`, `type_text`, `press_key`, `scroll`, `execute_js`, `capture_screenshot`) that allow AI assistants to drive the desktop app UI directly. This is essential for testing real bioinformatics blocks whose data schemas are complex and not practical to set programmatically via `set_block_data`.

#### Available tools

| Tool | Description | Input |
|------|-------------|-------|
| `capture_screenshot` | Capture window as PNG image | — |
| `click` | Click at CSS coordinates | `x`, `y`, optional `doubleClick` |
| `type_text` | Type text into focused element | `text` |
| `press_key` | Press a key with optional modifiers | `key`, optional `modifiers` |
| `scroll` | Scroll at a position | `x`, `y`, `deltaY` |
| `execute_js` | Run JS in renderer, return result | `code` |

#### Coordinate system — critical for correct clicking

**Problem:** `capture_screenshot` returns device-pixel images (e.g. 3840x2160 on a 2x DPI display), but `click`/`scroll` expect CSS-pixel coordinates (e.g. 1920x1080). The screenshot displayed in the AI's context is further scaled down, making visual coordinate estimation unreliable — clicks land on wrong elements.

**Solution:** Always use `execute_js` with `getBoundingClientRect()` to get the exact CSS coordinates of the target element before clicking.

**Pattern for interacting with UI elements:**

```
Step 1: Find element and get its position
  execute_js: (() => {
    const el = document.querySelector('input[placeholder*="Search"]');
    if (!el) return 'Not found';
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width/2, y: rect.y + rect.height/2, width: rect.width, height: rect.height };
  })()
  → returns { x: 1622, y: 215, width: 275, height: 34 }

Step 2: Click at the returned coordinates
  click: { x: 1622, y: 215 }

Step 3: Type if needed
  type_text: { text: "Alpaca" }

Step 4: Verify with screenshot
  capture_screenshot
```

**Window info helper** (run once per session to understand the coordinate space):
```
execute_js: (() => ({
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio
}))()
```

#### Practical workflow for testing real blocks

For blocks with complex UIs (e.g. MiXCR Clonotyping, Import Sequencing Data):

1. Use `create_project` + `open_project` via MCP API to set up the project
2. Use `add_block` via MCP API with `from-registry-v2` spec to add blocks
3. Use `execute_js` to find UI elements (dropdowns, inputs, buttons)
4. Use `click` + `type_text` + `press_key` to fill in block configuration
5. Use `capture_screenshot` to verify the UI state after each step
6. Use `run_block` via MCP API to start execution
7. Use `get_project_overview` to check block status programmatically

This hybrid approach (MCP API for project/block lifecycle, UI tools for block configuration) works well because block UIs have unique DOM structures that aren't practical to drive purely through `set_block_data`.

**File imports:** Do not attempt to add files (FASTQ, FASTA, metadata, etc.) programmatically. The file import dialog uses Platforma SDK's `openFileDialog` callback which routes through native OS file pickers or custom upload flows that can't be driven via MCP. Ask the user to add files manually, then continue with block configuration and execution via MCP.

---

## Open questions for review

1. **Package location:** `lib/node/pl-mcp-server/` — is this the right place? Alternative: `sdk/mcp-server/`.
   - **Answer:** Yes, `lib/node/pl-mcp-server/` is the right place.

2. **Test block choice:** Plan uses `enter-numbers-v3` + `sum-numbers-v3` from `etc/blocks/`. These are simple and well-tested. Any preference for other blocks?
   - **Answer:** Use the [VDJ 003 Tiny Trees](https://www.notion.so/mixcr/VDJ-003-Tiny-10x-and-Bulk-SHM-Trees-1513a83ff4af800bbe89df08f08e0501) project for real-world testing. It covers Import Sequencing Data, MiXCR Clonotyping (bulk + single cell), Clonotype Browser, and MiXCR SHM Trees. Keep `enter-numbers-v3` + `sum-numbers-v3` for fast automated integration tests that don't need a full backend.

3. **PFrame access in Step 7:** The worker thread creates PFrame instances via `pFrameApi`. The MCP server needs similar access. Should it go through MiddleLayer's `driverKit`, or do we need a dedicated PFrame interface?
   - **Answer:** Use MiddleLayer's API.

4. **Port selection:** Spec says 4200. Any conflict with existing dev tools on your setup?
   - **Answer:** 4200 is fine.

5. **`run_block` implementation:** The spec mentions `addUpstreams` flag. Need to verify the exact API in the mutator for starting block execution with upstream dependencies.
   - **Answer (resolved during implementation):** `project.runBlock(blockId)` auto-starts stale upstream blocks. No explicit flag needed at the MCP API level.
