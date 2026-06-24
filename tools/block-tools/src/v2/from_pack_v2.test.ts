import { test, expect } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fsp from "node:fs/promises";
import { existsSync } from "node:fs";
import { loadPackDescriptionFromManifest } from "./source_package";
import { buildPublishedCoords, resolveToRegistry } from "./resolve_to_registry";

/** Writes a minimal-but-valid v2 block-pack into a fresh temp module root and
 * returns its path (the folder containing `block-pack/`). */
async function makePackedBlock(): Promise<string> {
  const moduleRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "from-pack-v2-"));
  const blockPackDir = path.join(moduleRoot, "block-pack");
  await fsp.mkdir(blockPackDir);

  await fsp.writeFile(path.join(blockPackDir, "model.json"), JSON.stringify({ code: {} }));
  await fsp.writeFile(path.join(blockPackDir, "main.plj.gz"), "workflow-bytes");
  await fsp.writeFile(path.join(blockPackDir, "ui.tgz"), "ui-tarball-bytes");

  const manifest = {
    schema: "v2",
    description: {
      id: { organization: "milaboratories", name: "test-from-pack", version: "1.0.0" },
      components: {
        workflow: { type: "workflow-v1", main: { type: "relative", path: "main.plj.gz" } },
        model: { type: "relative", path: "model.json" },
        ui: { type: "relative", path: "ui.tgz" },
      },
      meta: {
        title: "Test",
        description: "Test block",
        organization: { name: "MiLaboratories", url: "https://milaboratories.com" },
      },
    },
    timestamp: 1782150933623,
    files: [
      { name: "main.plj.gz", size: 1, sha256: "A".repeat(64) },
      { name: "model.json", size: 1, sha256: "A".repeat(64) },
      { name: "ui.tgz", size: 1, sha256: "A".repeat(64) },
    ],
  };
  await fsp.writeFile(path.join(blockPackDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  return moduleRoot;
}

test("loadPackDescriptionFromManifest resolves manifest entries to absolute FS paths", async () => {
  const moduleRoot = await makePackedBlock();
  const blockPackDir = path.join(moduleRoot, "block-pack");

  const description = await loadPackDescriptionFromManifest(blockPackDir);

  // workflow + model resolve to absolute-file refs inside block-pack/.
  expect(description.components.workflow.main).toStrictEqual({
    type: "absolute-file",
    file: path.join(blockPackDir, "main.plj.gz"),
  });
  expect(description.components.model).toStrictEqual({
    type: "absolute-file",
    file: path.join(blockPackDir, "model.json"),
  });
  // ui (a ui.tgz archive) resolves into the absolute-folder slot.
  expect(description.components.ui).toStrictEqual({
    type: "absolute-folder",
    folder: path.join(blockPackDir, "ui.tgz"),
  });

  // The id passes through unchanged.
  expect(description.id).toStrictEqual({
    organization: "milaboratories",
    name: "test-from-pack",
    version: "1.0.0",
  });

  // All resolved paths exist on disk.
  expect(path.isAbsolute(description.components.model.file)).toBe(true);
  expect(existsSync(description.components.workflow.main.file)).toBe(true);
  expect(existsSync(description.components.model.file)).toBe(true);
  expect(existsSync(description.components.ui.folder)).toBe(true);
});

test("loadPackDescriptionFromManifest works against a real packed sum-numbers-v3", async () => {
  // Runs when the block has been built+packed (step 02 artifact present on
  // disk); skips gracefully in a clean checkout where block-pack/ is
  // gitignored. Guards against manifest-shape drift the hermetic fixture
  // above can't catch.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const real = path.resolve(here, "../../../../etc/blocks/sum-numbers-v3/block");
  if (!existsSync(path.join(real, "block-pack", "manifest.json"))) return;

  const description = await loadPackDescriptionFromManifest(path.join(real, "block-pack"));
  expect(existsSync(description.components.model.file)).toBe(true);
  expect(existsSync(description.components.workflow.main.file)).toBe(true);
  expect(existsSync(description.components.ui.folder)).toBe(true);
  expect(description.components.ui.folder.endsWith("ui.tgz")).toBe(true);
});

test("resolveToRegistry reads published.json into a from-registry-v2 spec", async () => {
  const folder = await fsp.mkdtemp(path.join(os.tmpdir(), "resolve-reg-"));
  const blockPackDir = path.join(folder, "block-pack");
  await fsp.mkdir(blockPackDir);
  // A stray `channel` in the file is ignored — channels are mutable registry
  // pointers, not part of the pinned coordinates.
  await fsp.writeFile(
    path.join(blockPackDir, "published.json"),
    JSON.stringify({
      registryUrl: "https://cdn.platforma.bio/blocks",
      id: { organization: "milaboratories", name: "test-from-pack", version: "2.3.4" },
      channel: "stable",
    }),
  );

  // from-pack-v2 carries `packUrl` (the block-pack dir as a file: URL);
  // published.json lives inside it.
  const spec = await resolveToRegistry({
    type: "from-pack-v2",
    packUrl: pathToFileURL(blockPackDir).href,
  });
  expect(spec).toStrictEqual({
    type: "from-registry-v2",
    registryUrl: "https://cdn.platforma.bio/blocks",
    id: { organization: "milaboratories", name: "test-from-pack", version: "2.3.4" },
  });
});

test("resolveToRegistry throws the documented error when published.json is missing", async () => {
  const folder = await fsp.mkdtemp(path.join(os.tmpdir(), "resolve-reg-missing-"));
  await expect(resolveToRegistry({ type: "dev-v2", folder })).rejects.toThrow(
    /has no published\.json/,
  );
});

test("buildPublishedCoords shapes the payload (immutable coords only)", () => {
  const id = { organization: "milaboratories", name: "test-from-pack", version: "1.0.0" };

  expect(
    buildPublishedCoords({ registryUrl: "https://cdn.platforma.bio/blocks", id }),
  ).toStrictEqual({
    registryUrl: "https://cdn.platforma.bio/blocks",
    id,
  });
});
