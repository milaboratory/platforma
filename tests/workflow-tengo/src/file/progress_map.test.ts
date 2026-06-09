import type { ResourceInfo } from "@milaboratories/pl-tree";
import { Pl } from "@milaboratories/pl-middle-layer";
import { createUploadProgressClient } from "@milaboratories/pl-drivers";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import { tplTest } from "@platforma-sdk/test";
import * as env from "../env";

type ProgressEntry = { name: string; info: ResourceInfo };

tplTest(
  "file import exposes 'progress' map with per-step progress resources",
  async ({ helper, expect, driverKit, pl }) => {
    // 1. List the data library via LsDriver and find a known test file.
    const storages = await driverKit.lsDriver.getStorageList();
    const library = storages.find((s) => s.name == env.libraryStorage);
    if (library === undefined) {
      throw new Error(`Library '${env.libraryStorage}' not found`);
    }
    const files = await driverKit.lsDriver.listFiles(library.handle, "");
    const ourFile = files.entries.find((f) => f.name == "answer_to_the_ultimate_question.txt");
    if (ourFile === undefined) {
      throw new Error("Test file not found in the library");
    }
    if (ourFile.type !== "file") {
      throw new Error("Expected a file, got a directory");
    }
    const importHandle = ourFile.handle;

    // 2. Render a template that calls file.importFile and exposes the new
    //    'progress' map field alongside the resulting blob.
    const result = await helper.renderTemplate(
      false,
      "file.progress_map",
      ["file", "progress"],
      (tx) => ({
        importHandle: tx.createValue(Pl.JsonObject, JSON.stringify(importHandle)),
      }),
    );

    // 3. Walk the progress map: collect (entryName, ResourceInfo) per child.
    //    The map is locked at creation, so once its fields list materializes
    //    it stays stable for the lifetime of the import resource.
    const progressEntries = result
      .computeOutput("progress", (a) => {
        if (a === undefined) return undefined;
        const names = a.listInputFields();
        if (names.length === 0) return undefined;
        const out: (ProgressEntry | undefined)[] = names.map((name) => {
          const child = a.traverse({ field: name, assertFieldType: "Input" });
          return child === undefined ? undefined : { name, info: child.resourceInfo };
        });
        if (out.some((e) => e === undefined)) return undefined;
        return out as ProgressEntry[];
      })
      .withPreCalculatedValueTree();

    const entries = await progressEntries.awaitStableValue();
    expect(entries).toBeDefined();
    expect(entries!.length).toBeGreaterThanOrEqual(1);
    // Steps are named zero-padded decimal strings starting at "01" to keep fields
    // ordered following the execution order.
    expect(entries![0].name).toBe("01");

    // 4. Call ProgressAPI.GetStatus for each map entry. Each entry's
    //    sub-resource must be reachable via the progress wire.
    const logger = new ConsoleLoggerAdapter();
    const progressClient = createUploadProgressClient(pl, logger);

    for (const entry of entries!) {
      const status = await progressClient.getStatus(entry.info);
      expect(status).toBeDefined();
      expect(typeof status.progress).toBe("number");
      expect(typeof status.done).toBe("boolean");
    }

    // 5. End-to-end sanity: the import must complete and produce a usable
    //    blob. Confirms the new 'progress' field plumbing didn't break the
    //    underlying import chain.
    const file = result
      .computeOutput("file", (a, ctx) => {
        if (a === undefined) return undefined;
        return driverKit.blobDriver.getOnDemandBlob(a.persist(), ctx);
      })
      .withPreCalculatedValueTree();

    const fileStableValue = await file.awaitStableValue();
    expect(fileStableValue).toBeDefined();
    const fileContent = Buffer.from(
      await driverKit.blobDriver.getContent(fileStableValue!.handle),
    ).toString();
    expect(fileContent).toEqual("42\n");

    // 6. After the import has finished, every progress entry must report done.
    for (const entry of entries!) {
      const status = await progressClient.getStatus(entry.info);
      expect(status.done).toBe(true);
    }
  },
);
