import type { MiddleLayerDriverKit } from "@milaboratories/pl-middle-layer";
import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { awaitStableState, tplTest } from "@platforma-sdk/test";
import path from "node:path";
import { vi } from "vitest";
import * as env from "../env";
import {
  hasValuesTree,
  OUTPUT_TIMEOUT,
  renderWorkflowV2,
  resultFileContent,
  resultJson,
  type V2Render,
} from "./render-v2";

// Each test renders a workflow and waits for its imports on a live backend.
vi.setConfig({ testTimeout: 240_000 });

/*
 * The stored layout of a render's effect, as the engine reads it:
 *
 *   effect: EphStdMap/1, inputs locked
 *   └─ imports: EphStdMap/1, inputs locked
 *      └─ <source>: ImportEntry/1, inputs locked
 *         ├─ upload: the storage-side upload a client sends parts to (uploads only)
 *         ├─ progress: the import's map of progress steps
 *         └─ file: the imported file
 *
 * Every field is an Input field.
 */

const ASSET = "answer_to_the_ultimate_question.txt";
const ASSET_CONTENT = "42\n";

/** A grant to upload the asset from this machine, as the client mints it. */
async function uploadSource(driverKit: MiddleLayerDriverKit): Promise<string> {
  return await driverKit.lsDriver.getLocalFileHandle(path.resolve(`../../assets/${ASSET}`));
}

/** The asset as a file of the server data library the tests run with. */
async function librarySource(
  driverKit: MiddleLayerDriverKit,
  name: string = ASSET,
): Promise<string> {
  const library = (await driverKit.lsDriver.getStorageList()).find(
    (s) => s.name === env.libraryStorage,
  );
  if (library === undefined) throw new Error(`no data library ${env.libraryStorage}`);
  const file = (await driverKit.lsDriver.listFiles(library.handle, "")).entries.find(
    (e) => e.name === name,
  );
  if (file === undefined || file.type !== "file") throw new Error(`no file ${name} in the library`);
  return file.handle;
}

/** A library source naming a path the library does not hold. */
function missingLibrarySource(): string {
  const record = { storageId: env.libraryStorage, path: "/no-such-file.txt" };
  return `index://index/${encodeURIComponent(JSON.stringify(record))}`;
}

type Part = { type: string; inputsLocked: boolean; ready: boolean; fields: string[] };

function part(a: PlTreeNodeAccessor): Part {
  return {
    type: `${a.resourceType.name}/${a.resourceType.version}`,
    inputsLocked: a.getInputsLocked(),
    ready: a.getIsReadyOrError(),
    fields: a.listInputFields().slice().sort(),
  };
}

function input(a: PlTreeNodeAccessor | undefined, name: string): PlTreeNodeAccessor | undefined {
  return a?.traverse({ field: name, assertFieldType: "Input" });
}

type EffectLayout = {
  effect: Part;
  imports: Part;
  entries: Record<string, Part & { targets: Record<string, string> }>;
};

/** The effect's map, section and entries with the types their fields point to, once every part is
 *  ready. */
async function settledEffect(render: V2Render): Promise<EffectLayout> {
  return await awaitStableState(
    render.computeOutput("effect", (a) => {
      const imports = input(a, "imports");
      if (a === undefined || imports === undefined) return undefined;
      const entries: EffectLayout["entries"] = {};
      for (const source of imports.listInputFields()) {
        const entry = input(imports, source);
        if (entry === undefined || !entry.getIsReadyOrError()) return undefined;
        const targets: Record<string, string> = {};
        for (const name of entry.listInputFields()) {
          const target = input(entry, name);
          if (target === undefined) return undefined;
          targets[name] = `${target.resourceType.name}/${target.resourceType.version}`;
        }
        entries[source] = { ...part(entry), targets };
      }
      if (!a.getIsReadyOrError() || !imports.getIsReadyOrError()) return undefined;
      return { effect: part(a), imports: part(imports), entries };
    }),
    OUTPUT_TIMEOUT,
  );
}

/** Starts the upload the effect lists for `source`, as the engine would, and waits for it to end. */
async function runUpload(render: V2Render, source: string, driverKit: MiddleLayerDriverKit) {
  const progress = render
    .computeOutput("effect", (a, ctx) => {
      const upload = input(input(input(a, "imports"), source), "upload");
      if (upload === undefined) return undefined;
      return driverKit.uploadDriver.getProgressId(upload.persist(), ctx);
    })
    .withPreCalculatedValueTree();
  return await progress.awaitStableValue();
}

/** The entry of `source` once its fields are listed, with whether it is ready. */
async function listedEntry(render: V2Render, source: string) {
  const entry = render.computeOutput("effect", (a) => {
    const node = input(input(a, "imports"), source);
    if (node === undefined) return undefined;
    return { fields: node.listInputFields().slice().sort(), ready: node.getIsReadyOrError() };
  });
  const deadline = AbortSignal.timeout(OUTPUT_TIMEOUT);
  for (;;) {
    const value = await entry.getValue();
    if (value !== undefined) return value;
    await entry.awaitChange(deadline);
  }
}

/** The step names of the progress map listed for `source`, once stable. */
async function progressSteps(render: V2Render, source: string) {
  return await awaitStableState(
    render.computeOutput("effect", (a) =>
      input(input(input(a, "imports"), source), "progress")?.listInputFields(),
    ),
    OUTPUT_TIMEOUT,
  );
}

const MAP = { type: "EphStdMap/1", inputsLocked: true, ready: true };

tplTest.concurrent(
  "a workflow that imports nothing has an effect whose imports section is empty",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const render = await renderWorkflowV2(helper, "v2.effect-none", { blockId: "effect-none" });
    expect(await resultJson(render, "ran")).eq(true);
    expect(await settledEffect(render)).toStrictEqual({
      effect: { ...MAP, fields: ["imports"] },
      imports: { ...MAP, fields: [] },
      entries: {},
    });
  },
);

tplTest.concurrent.for([{ isProduction: true }, { isProduction: false }])(
  "an uploaded file is listed under its source with its upload, progress and file, and reaches the body (isProduction $isProduction)",
  async ({ isProduction }, { helper, pl, driverKit, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const source = await uploadSource(driverKit);
    const render = await renderWorkflowV2(helper, "v2.effect-import", {
      blockId: `effect-upload-${isProduction}`,
      isProduction,
      args: { sources: [source] },
    });
    // listed before anyone uploads, and waiting for the upload
    expect(await listedEntry(render, source)).toStrictEqual({
      fields: ["file", "progress", "upload"],
      ready: false,
    });
    expect(await runUpload(render, source, driverKit)).toMatchObject({ done: true });

    const layout = await settledEffect(render);
    expect(layout.effect).toStrictEqual({ ...MAP, fields: ["imports"] });
    expect(layout.imports).toStrictEqual({ ...MAP, fields: [source] });
    expect(layout.entries[source]).toMatchObject({
      type: "ImportEntry/1",
      inputsLocked: true,
      ready: true,
      fields: ["file", "progress", "upload"],
      targets: { file: "Blob/1", progress: "std/map/1" },
    });
    expect(layout.entries[source].targets.upload).toMatch(/^BlobUpload\/[^/]+\/1$/);
    expect(await progressSteps(render, source)).toStrictEqual(["01"]);
    expect(await resultFileContent(render, "file0", driverKit)).eq(ASSET_CONTENT);
  },
);

tplTest.concurrent(
  "a library file is listed under its source with progress and file and no upload, and reaches the body",
  async ({ helper, pl, driverKit, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const source = await librarySource(driverKit);
    const render = await renderWorkflowV2(helper, "v2.effect-import", {
      blockId: "effect-library",
      args: { sources: [source] },
    });

    const layout = await settledEffect(render);
    expect(layout.imports).toStrictEqual({ ...MAP, fields: [source] });
    expect(layout.entries[source]).toStrictEqual({
      type: "ImportEntry/1",
      inputsLocked: true,
      ready: true,
      fields: ["file", "progress"],
      targets: { file: "Blob/1", progress: "std/map/1" },
    });
    expect((await progressSteps(render, source))?.length).toBeGreaterThan(0);
    expect(await resultFileContent(render, "file0", driverKit)).eq(ASSET_CONTENT);
  },
);

tplTest.concurrent(
  "a source imported twice is listed once and both imports give the same file; another source gives another file",
  async ({ helper, pl, driverKit, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const upload = await uploadSource(driverKit);
    // a library file whose content differs from the uploaded one's
    const library = await librarySource(driverKit, "another_answer_to_the_ultimate_question.txt");
    const render = await renderWorkflowV2(helper, "v2.effect-import", {
      blockId: "effect-twice",
      args: { sources: [upload, library, upload] },
    });
    await runUpload(render, upload, driverKit);

    const layout = await settledEffect(render);
    expect(layout.imports.fields).toStrictEqual([library, upload].sort());
    const files = await awaitStableState(
      render.computeOutput("result", (a) => {
        const ids = ["file0", "file1", "file2"].map((name) => input(a, name)?.id);
        return ids.includes(undefined) ? undefined : ids;
      }),
      OUTPUT_TIMEOUT,
    );
    expect(files).toHaveLength(3);
    expect(files?.[0]).eq(files?.[2]);
    expect(files?.[1]).not.eq(files?.[0]);
  },
);

tplTest.concurrent(
  "a workflow with a prepare step lists the imports of its body",
  async ({ helper, pl, driverKit, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const source = await librarySource(driverKit);
    const render = await renderWorkflowV2(helper, "v2.effect-prepare", {
      blockId: "effect-prepare",
      args: { source },
    });

    expect(await resultJson(render, "x")).eq(1);
    const layout = await settledEffect(render);
    expect(layout.imports.fields).toStrictEqual([source]);
    expect(await resultFileContent(render, "file0", driverKit)).eq(ASSET_CONTENT);
  },
);

tplTest.concurrent(
  "a failed import fails the effect with the import's error, reached through its entry",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const source = missingLibrarySource();
    const render = await renderWorkflowV2(helper, "v2.effect-only", {
      blockId: "effect-failed",
      args: { sources: [source] },
    });

    const effect = awaitStableState(
      render.computeOutput("effect", (a) => input(input(a, "imports"), source)?.listInputFields()),
      OUTPUT_TIMEOUT,
    );
    await expect(effect).rejects.toThrow(/\/imports"[\s\S]*no-such-file\.txt[\s\S]*item not found/);
  },
);

tplTest.concurrent.for([
  {
    name: "a download URL",
    source: "download://download/%7B%7D",
    error: /upload:\/\/upload\/.*index:\/\/index\//,
  },
  { name: "a map", source: { path: "/a.txt" }, error: /effect.importFile takes a source string/ },
])(
  "a source that is neither an upload grant nor a library file is refused ($name)",
  async ({ name, source, error }, { helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const render = await renderWorkflowV2(helper, "v2.effect-import", {
      blockId: `effect-refused-${name.replace(/ /g, "-")}`,
      args: { sources: [source] },
    });
    await expect(resultJson(render, "file0")).rejects.toThrow(error);
  },
);

tplTest.concurrent(
  "importing through the effect after the body has returned fails the render, even a source the body imported",
  async ({ helper, pl, driverKit, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const render = await renderWorkflowV2(helper, "v2.effect-late", {
      blockId: "effect-late",
      args: { source: await librarySource(driverKit) },
    });
    await expect(resultJson(render, "ran")).rejects.toThrow(/after the workflow body returned/);
  },
);
