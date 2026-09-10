import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dedent from "dedent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLatestVersion, updatePackages } from "./updater";

/** Stand-in for the registry. Rejects any package it was not told about, so a test that should
 * never reach the resolver fails loudly instead of quietly taking a made-up version, and
 * records what was asked for so package selection can be asserted. */
function fakeLatest(versions: Record<string, string> = {}) {
  const asked: string[] = [];
  return Object.assign(
    async (packageName: string) => {
      asked.push(packageName);
      const version = versions[packageName];
      if (version === undefined) throw new Error(`unexpected registry lookup: ${packageName}`);
      return version;
    },
    { asked },
  );
}

async function tmpDir(): Promise<AsyncDisposable & { path: string }> {
  // TODO: migrate to `mkdtempDisposable` after migration to Node.js 24
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), "deps-updater-test-"));
  return {
    path: dirPath,
    [Symbol.asyncDispose]: () => fs.rm(dirPath, { recursive: true, force: true }),
  };
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

    await updatePackages(dir.path, fakeLatest());

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

    await updatePackages(dir.path, fakeLatest());

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

    await updatePackages(dir.path, fakeLatest());

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

    await updatePackages(dir.path, fakeLatest());

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

    const before = (await fs.stat(path.join(dir.path, "pnpm-workspace.yaml"))).mtimeMs;
    await updatePackages(dir.path, fakeLatest());
    const after = (await fs.stat(path.join(dir.path, "pnpm-workspace.yaml"))).mtimeMs;

    expect(after).toBe(before);
    expect(await readWorkspace(dir.path)).toBe(content);
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

    const registry = fakeLatest({ "@platforma-sdk/model": "1.9.0" });
    await updatePackages(dir.path, registry);

    const result = await readWorkspace(dir.path);
    expect(registry.asked).toEqual(["@platforma-sdk/model"]);
    expect(result).toContain('"@platforma-sdk/model": 1.9.0');
    expect(result).toContain("some-other-pkg: ^5.0.0");
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

    await updatePackages(dir.path, fakeLatest());

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

    await updatePackages(dir.path, fakeLatest());

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

    const registry = fakeLatest({
      "@platforma-sdk/model": "2.1.0",
      "@platforma-sdk/workflow-tengo": "1.6.4",
    });
    await updatePackages(dir.path, registry);

    const result = await readWorkspace(dir.path);
    // Only the unpinned SDK entries are looked up: ag-grid is pinned and vue is not ours.
    expect([...registry.asked].sort()).toEqual([
      "@platforma-sdk/model",
      "@platforma-sdk/workflow-tengo",
    ]);
    expect(result).toContain('"@platforma-sdk/model": 2.1.0');
    expect(result).toContain('"@platforma-sdk/workflow-tengo": 1.6.4');
    expect(result).toContain("~34.1.2");
    expect(result).not.toContain("^34.2.0");
    expect(result).not.toContain("*ag-grid");
    expect(result).toContain("vue: ^3.5.0");
    expect(result).toContain("packages");
  });
});

/** The default resolver, which every test above deliberately replaces. Covered here with
 * `fetch` stubbed, so the request shape, the response parsing and the retry loop are asserted
 * without the suite reaching npmjs.org. */
describe("registry lookup", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Returns the URLs requested, in order. The last response is reused if fetch is called
   * more times than there are responses, so an unexpected retry shows up as a call count. */
  function stubFetch(...responses: Response[]): string[] {
    const urls: string[] = [];
    let next = 0;
    vi.stubGlobal("fetch", async (url: string | URL) => {
      urls.push(String(url));
      return responses[Math.min(next++, responses.length - 1)];
    });
    return urls;
  }

  const distTags = (body: unknown) => new Response(JSON.stringify(body));

  it("requests the package's dist-tags and returns latest", async () => {
    const urls = stubFetch(distTags({ latest: "3.4.5", next: "4.0.0-rc.1" }));

    await expect(getLatestVersion("@platforma-sdk/model")).resolves.toBe("3.4.5");
    expect(urls).toEqual(["https://registry.npmjs.org/-/package/@platforma-sdk/model/dist-tags"]);
  });

  it("rejects a response carrying no latest dist-tag", async () => {
    stubFetch(distTags({ next: "4.0.0-rc.1" }));

    await expect(getLatestVersion("@platforma-sdk/model")).rejects.toThrow("no 'latest' dist-tag");
  });

  it("does not retry a non-retryable status", async () => {
    const urls = stubFetch(new Response("", { status: 404 }));

    await expect(getLatestVersion("@platforma-sdk/nope")).rejects.toThrow(
      "registry returned HTTP 404",
    );
    expect(urls).toHaveLength(1);
  });

  it("retries a 429 once Retry-After allows", async () => {
    // An HTTP-date in the past parses to a zero wait, so this covers the retry loop and the
    // Retry-After date branch without putting a real sleep back into the suite.
    const urls = stubFetch(
      new Response("", {
        status: 429,
        headers: { "retry-after": "Thu, 01 Jan 1970 00:00:00 GMT" },
      }),
      distTags({ latest: "1.0.1" }),
    );

    await expect(getLatestVersion("@milaboratories/helpers")).resolves.toBe("1.0.1");
    expect(urls).toHaveLength(2);
  });
});
