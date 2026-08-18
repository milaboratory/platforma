import { beforeAll, describe, expect, test } from "vitest";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BlockPackLocationReference } from "@milaboratories/pl-model-common";
import { resolveBlockPackLocation } from "./location_provider";

/**
 * The filesystem side of template import, driven against real directories.
 *
 * Everything here is about what is actually on disk — which layout is present, which spec
 * addresses it, whether a path with a space still resolves — so these tests build the layouts
 * rather than mock the readers. What each failure *says* to the reader is the resolver's, and
 * lives with it.
 */

const KIND = "@milaboratories/milaboratories.test-loc.kind@1.2.3";

let root: string;

beforeAll(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), "template-location-"));
});

const locate = (dir: string) =>
  resolveBlockPackLocation(pathToFileURL(dir).href as BlockPackLocationReference);

/**
 * A built-but-never-packed block: the source `package.json` names the components, and
 * the kind is only in the compiled model. The shape a developer's working tree is in.
 */
async function writeDevBlock(
  dir: string,
  options: { title?: string; kind?: string | null } = {},
): Promise<string> {
  const { title = "Located Block", kind = KIND } = options;
  await fsp.mkdir(path.join(dir, "ui"), { recursive: true });
  await fsp.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "@milaboratories/milaboratories.test-loc",
      version: "1.0.0",
      block: {
        components: {
          workflow: "./main.plj.gz",
          model: "./model.json",
          ui: "./ui",
        },
        meta: {
          title,
          description: "A block used to exercise location resolution",
          organization: { name: "MiLaboratories Inc", url: "https://milaboratories.com/" },
        },
      },
    }),
  );
  await fsp.writeFile(path.join(dir, "main.plj.gz"), "workflow-bytes");
  await fsp.writeFile(path.join(dir, "ui", "index.html"), "<html></html>");
  // A real config container, because loading a source description normalizes the model
  // to read its feature flags and refuses anything it cannot recognize. The render
  // envelope is left empty: the kind sits above it, and nothing on this path runs the
  // block.
  await fsp.writeFile(
    path.join(dir, "model.json"),
    JSON.stringify({ v3: {}, code: {}, ...(kind === null ? {} : { kind }) }),
  );
  return dir;
}

/** A packed block: one manifest naming everything, kind included. */
async function writePackedBlock(
  dir: string,
  options: { title?: string; kind?: string | null } = {},
): Promise<string> {
  const { title = "Packed Block", kind = KIND } = options;
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      schema: "v2",
      description: {
        id: { organization: "milaboratories", name: "test-loc", version: "1.0.0" },
        components: {
          workflow: { type: "workflow-v1", main: { type: "relative", path: "main.plj.gz" } },
          model: { type: "relative", path: "model.json" },
          ui: { type: "relative", path: "ui.tgz" },
        },
        meta: {
          title,
          description: "A packed block used to exercise location resolution",
          organization: { name: "MiLaboratories Inc", url: "https://milaboratories.com/" },
        },
        ...(kind === null ? {} : { kind }),
      },
      files: [],
    }),
  );
  return dir;
}

describe("a block built from source", () => {
  test("resolves to the dev spec pointing at that very folder", async () => {
    const dir = await writeDevBlock(path.join(root, "dev-basic"));

    const outcome = await locate(dir);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.spec).toEqual({ type: "dev-v2", folder: dir });
    expect(outcome.title).toBe("Located Block");
  });

  test("a model declaring no kind still resolves", async () => {
    // Whether the block is the one the entry meant is settled once it has been prepared,
    // from the compiled model there. Here it is only a block that was found.
    const dir = await writeDevBlock(path.join(root, "dev-no-kind"), { kind: null });

    const outcome = await locate(dir);

    expect(outcome.ok).toBe(true);
  });
});

describe("a packed block", () => {
  test("resolves to the pack spec addressing the folder the manifest was read from", async () => {
    const dir = await writePackedBlock(path.join(root, "packed"));

    const outcome = await locate(dir);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.spec).toEqual({ type: "from-pack-v2", packUrl: pathToFileURL(dir).href });
    expect(outcome.title).toBe("Packed Block");
  });

  test("the manifest wins over a package.json beside it", async () => {
    // A facade package that has been packed holds both shapes; the manifest is the
    // built artifact, and it is what the preparer will read.
    const dir = path.join(root, "both-shapes");
    await writeDevBlock(dir);
    await writePackedBlock(dir, { title: "Packed Block" });

    const outcome = await locate(dir);

    expect(outcome.ok && outcome.spec.type).toBe("from-pack-v2");
    expect(outcome.ok && outcome.title).toBe("Packed Block");
  });
});

describe("a folder that is not itself the block", () => {
  test("the conventional 'block' subfolder is found", async () => {
    // So a hand-written entry may name what a person calls the block. Export never
    // writes this form: it emits the folder the loader accepts.
    const parent = path.join(root, "parent-block");
    await writeDevBlock(path.join(parent, "block"));

    const outcome = await locate(parent);

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.spec).toEqual({
      type: "dev-v2",
      folder: path.join(parent, "block"),
    });
  });

  test("the 'meta' subfolder too", async () => {
    const parent = path.join(root, "parent-meta");
    await writeDevBlock(path.join(parent, "meta"));

    const outcome = await locate(parent);

    expect(outcome.ok && outcome.spec).toEqual({
      type: "dev-v2",
      folder: path.join(parent, "meta"),
    });
  });
});

describe("what cannot be read", () => {
  test("a folder that does not exist is not-found", async () => {
    const outcome = await locate(path.join(root, "nowhere-at-all"));

    expect(outcome).toEqual({ ok: false, reason: "not-found" });
  });

  test("a folder that exists but holds nothing is not-a-block", async () => {
    // The two are kept apart because they send the reader somewhere different: one is
    // a template carried to another machine, the other is a path one level off.
    const dir = path.join(root, "empty");
    await fsp.mkdir(dir, { recursive: true });

    const outcome = await locate(dir);

    expect(outcome).toEqual({ ok: false, reason: "not-a-block" });
  });

  test("an ordinary npm package is not a block", async () => {
    // A `package.json` with no block description must not reach the loader, which
    // would throw rather than report.
    const dir = path.join(root, "plain-package");
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "just-a-package", version: "1.0.0" }),
    );

    const outcome = await locate(dir);

    expect(outcome).toEqual({ ok: false, reason: "not-a-block" });
  });

  test("a scheme with no reader here is reported as such, not as a missing block", async () => {
    const outcome = await resolveBlockPackLocation(
      "https://blocks.internal/enter-numbers" as BlockPackLocationReference,
    );

    expect(outcome).toEqual({ ok: false, reason: "unsupported-scheme" });
  });
});

describe("paths that need decoding", () => {
  test("a folder whose name contains a space resolves", async () => {
    // The value is a URL, so the space arrives as `%20`; reading the URL's pathname
    // directly instead of converting it would look correct and never find the folder.
    const dir = await writeDevBlock(path.join(root, "my blocks", "spaced"));

    const location = pathToFileURL(dir).href;
    expect(location).toContain("%20");

    const outcome = await resolveBlockPackLocation(location as BlockPackLocationReference);

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.spec).toEqual({ type: "dev-v2", folder: dir });
  });
});
