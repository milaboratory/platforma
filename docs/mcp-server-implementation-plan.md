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

### Step 6: Await + run full pipeline

Tools:
- `await_block_done` → polls `project.overview`, watches `calculationStatus` until `"Done"` or error
  - Input: `projectId`, `blockId`, `timeout` (default 120000ms)
  - Returns: block overview on completion, or `{ timedOut: true, status }` on timeout
  - Follows pattern from `sdk/test/src/test-block.ts:awaitBlockDone`
- `await_stable` → `project.getBlockState(blockId)` computable → `awaitStableValue(timeout)`
  - Returns: stable block state, or `{ timedOut: true, stable: false }` on timeout

**Test:** `pipeline.test.ts` — **the key e2e test proving the full automated loop**:
1. Create project
2. Add `enter-numbers-v3` block, add `sum-numbers-v3` block
3. `set_block_data` on enter-numbers with `{ numbers: [10, 20, 30] }`
4. Wire sum-numbers to use enter-numbers output (via `set_block_data` on sum-numbers)
5. `run_block` on sum-numbers (with `addUpstreams` so enter-numbers runs first)
6. `await_block_done` → waits for completion
7. `await_stable` → waits for outputs
8. `get_block_state` → verify final state
9. Timeout test: set very short timeout, verify `timedOut: true` response

**Desktop validation:** Run the full pipeline via MCP client while watching the desktop app — see blocks transition through NotCalculated → Running → Done states in real time.

---

### Step 7: Data query tools

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

### Step 8: Logs tool

Tool:
- `get_logs` → reads execution logs for a block
  - Input: `projectId`, `blockId`, `lines` (default 100), `search` (regex filter)
  - Reuses `logsApi` patterns

**Test:** `logs.test.ts`:
1. Run a block, await completion
2. `get_logs` → returns log text
3. `get_logs` with search filter → returns filtered lines
4. `get_logs` on non-running block → returns available logs or empty

**Desktop validation:** Run a block, read logs via MCP, compare with log viewer in desktop app.

---

### Step 9: Registry search tools

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

### Step 10: Screenshot + open_block (desktop-specific)

Tools:
- `open_block` → navigates desktop UI to display specified block
- `capture_screenshot` → captures currently displayed block's UI as base64 PNG

Implementation requires callback interface injected by desktop app:
```typescript
interface McpDesktopCallbacks {
  openBlock(projectId: string, blockId: string): Promise<void>;
  captureScreenshot(): Promise<Buffer>;
}
```

**Desktop-app changes:**
- Worker implements callbacks via `invokeParentMethod` → main process → `WebContentsView`
- Main process handles `open-block` message: navigate UI to block
- Main process handles `capture-screenshot` message: `webContents.capturePage()` → PNG buffer
- Follows existing `SendPuppetCommand` / `invokeParentMethod` IPC patterns

**Test:** Desktop e2e tests (`packages/e2e/`):
1. Start app with MCP enabled
2. Connect MCP client
3. Add block, configure, run, await done
4. `open_block` → navigate to block
5. `capture_screenshot` → verify base64 PNG returned
6. Error: `capture_screenshot` without `open_block` first

---

## What's NOT in this plan (deferred per spec)

- `invoke_action` prototype — depends on action system readiness
- Kind-enhanced tools (`add_block_by_kind`, `get_kind_schema`, etc.) — deferred to kind packages
- Remote MCP access
- MCP prompts/sampling primitives
- File upload through MCP

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

---

## Open questions for review

1. **Package location:** `lib/node/pl-mcp-server/` — is this the right place? Alternative: `sdk/mcp-server/`.
2. **Test block choice:** Plan uses `enter-numbers-v3` + `sum-numbers-v3` from `etc/blocks/`. These are simple and well-tested. Any preference for other blocks?
3. **PFrame access in Step 7:** The worker thread creates PFrame instances via `pFrameApi`. The MCP server needs similar access. Should it go through MiddleLayer's `driverKit`, or do we need a dedicated PFrame interface?
4. **Port selection:** Spec says 4200. Any conflict with existing dev tools on your setup?
5. **`run_block` implementation:** The spec mentions `addUpstreams` flag. Need to verify the exact API in the mutator for starting block execution with upstream dependencies.
