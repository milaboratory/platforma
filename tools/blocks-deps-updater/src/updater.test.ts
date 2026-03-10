import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import dedent from "dedent";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const BIN_PATH = path.resolve(__dirname, "../bin/run.mjs");

async function tmpDir(): Promise<AsyncDisposable & { path: string }> {
  // TODO: migrate to `mkdtempDisposable` after migration to Node.js 24
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), "deps-updater-test-"));
  return {
    path: dirPath,
    [Symbol.asyncDispose]: () => fs.rm(dirPath, { recursive: true, force: true }),
  };
}

async function runUpdater(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(process.execPath, [BIN_PATH], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
  });
  return stdout;
}

function writeWorkspace(dir: string, content: string): Promise<void> {
  return fs.writeFile(path.join(dir, "pnpm-workspace.yaml"), content, "utf8");
}

function readWorkspace(dir: string): Promise<string> {
  return fs.readFile(path.join(dir, "pnpm-workspace.yaml"), "utf8");
}

describe("pinned versions enforcement", () => {
  it("patches plain versions", async () => {
    await using dir = await tmpDir();
    await writeWorkspace(
      dir.path,
      dedent`
        catalog:
          ag-grid-enterprise: ^33.0.4
          ag-grid-vue3: ^33.0.4
      ` + "\n",
    );

    await runUpdater(dir.path);

    expect(await readWorkspace(dir.path)).toBe(
      dedent`
        catalog:
          ag-grid-enterprise: ~34.1.2
          ag-grid-vue3: ~34.1.2
      ` + "\n",
    );
  });

  it("patches YAML anchor and alias", async () => {
    await using dir = await tmpDir();
    await writeWorkspace(
      dir.path,
      dedent`
        catalog:
          ag-grid-enterprise: &ag-grid ^33.0.4
          ag-grid-vue3: *ag-grid
      ` + "\n",
    );

    await runUpdater(dir.path);

    const result = await readWorkspace(dir.path);
    expect(result).toContain("ag-grid-enterprise: ~34.1.2");
    expect(result).toContain("ag-grid-vue3: ~34.1.2");
    expect(result).not.toContain("&ag-grid");
    expect(result).not.toContain("*ag-grid");
  });

  it("patches single-quoted keys", async () => {
    await using dir = await tmpDir();
    await writeWorkspace(
      dir.path,
      dedent`
        catalog:
          'ag-grid-enterprise': &ag-grid ~33.3.2
          'ag-grid-vue3': *ag-grid
      ` + "\n",
    );

    await runUpdater(dir.path);

    const result = await readWorkspace(dir.path);
    expect(result).toContain("ag-grid-enterprise");
    expect(result).toContain("~34.1.2");
    expect(result).not.toContain("~33.3.2");
  });

  it("leaves double-quoted keys with correct alias untouched", async () => {
    await using dir = await tmpDir();
    const content =
      dedent`
        catalog:
          "ag-grid-enterprise": &ag-grid ~34.1.2
          "ag-grid-vue3": *ag-grid
      ` + "\n";
    await writeWorkspace(dir.path, content);

    await runUpdater(dir.path);

    expect(await readWorkspace(dir.path)).toBe(content);
  });

  it("leaves already-correct versions unchanged", async () => {
    await using dir = await tmpDir();
    const content =
      dedent`
        catalog:
          ag-grid-enterprise: ~34.1.2
          ag-grid-vue3: ~34.1.2
      ` + "\n";
    await writeWorkspace(dir.path, content);

    const output = await runUpdater(dir.path);

    expect(await readWorkspace(dir.path)).toBe(content);
    expect(output).toContain("up to date");
  });

  it("does not touch catalog without ag-grid", async () => {
    await using dir = await tmpDir();
    const content =
      dedent`
        catalog:
          "@platforma-sdk/model": ^1.2.3
          some-other-pkg: ^5.0.0
      ` + "\n";
    await writeWorkspace(dir.path, content);

    await runUpdater(dir.path);

    const result = await readWorkspace(dir.path);
    expect(result).not.toContain("ag-grid");
  });

  it("preserves comments and other catalog entries", async () => {
    await using dir = await tmpDir();
    await writeWorkspace(
      dir.path,
      dedent`
        # workspace config
        catalog:
          # grid packages
          ag-grid-enterprise: ^33.0.4
          ag-grid-vue3: ^33.0.4
          # other deps
          some-lib: ^1.0.0
      ` + "\n",
    );

    await runUpdater(dir.path);

    const result = await readWorkspace(dir.path);
    expect(result).toContain("# workspace config");
    expect(result).toContain("# grid packages");
    expect(result).toContain("# other deps");
    expect(result).toContain("some-lib");
    expect(result).toContain("ag-grid-enterprise: ~34.1.2");
    expect(result).toContain("ag-grid-vue3: ~34.1.2");
  });

  it("patches mixed versions (enterprise correct, vue3 wrong)", async () => {
    await using dir = await tmpDir();
    await writeWorkspace(
      dir.path,
      dedent`
        catalog:
          ag-grid-enterprise: ~34.1.2
          ag-grid-vue3: ^33.0.4
      ` + "\n",
    );

    await runUpdater(dir.path);

    expect(await readWorkspace(dir.path)).toBe(
      dedent`
        catalog:
          ag-grid-enterprise: ~34.1.2
          ag-grid-vue3: ~34.1.2
      ` + "\n",
    );
  });

  it("handles real-world block format with SDK packages and ag-grid", async () => {
    await using dir = await tmpDir();
    await writeWorkspace(
      dir.path,
      dedent`
        packages:
          - model
          - ui

        catalog:
          "@platforma-sdk/model": ^2.0.0
          "@platforma-sdk/workflow-tengo": ^1.5.0
          'ag-grid-enterprise': &ag-grid ^34.2.0
          'ag-grid-vue3': *ag-grid
          vue: ^3.5.0
      ` + "\n",
    );

    await runUpdater(dir.path);

    const result = await readWorkspace(dir.path);
    expect(result).toContain("~34.1.2");
    expect(result).not.toContain("^34.2.0");
    expect(result).not.toContain("*ag-grid");
    expect(result).toContain("vue");
    expect(result).toContain("packages");
  });
});
