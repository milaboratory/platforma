import { expect, test } from "vitest";
import * as tp from "node:timers/promises";
import { resourceIdToString } from "@milaboratories/pl-client";
import type { FolderId, FoldersItem } from "@milaboratories/pl-model-middle-layer";
import type { TemplateId } from "@milaboratories/pl-model-common";
import { PROJECT_TEMPLATE_SCHEMA_V1 } from "@milaboratories/pl-model-common";
import { withMl } from "../test/with_ml";
import { createTemplate } from "../mutator/template";
import type { FoldersListing } from "./folders";
import type { MiddleLayer } from "./middle_layer";
import { ensureTemplateListRid } from "./template_list";

/**
 * Sharing folders and projects against a live backend: what a copy out of a share builds, and
 * where it puts it.
 *
 * The test server has one user, so every share here goes to everyone and is copied by its own
 * donor, which is enough to exercise the whole copy: the envelope is discovered and copied from
 * exactly as a recipient's would be.
 *
 * Needs a backend, like every `withMl` test in this package, and no gate: `PL_ADDRESS` is either
 * configured or the client fails to connect.
 */

test("a shared folder is rebuilt whole inside the destination, its root named to fit there", async () => {
  await withMl(async (ml) => {
    const source = await ml.createFolder("Repertoires");
    await ml.setFolderDescription(source, "Every donor, both replicates");
    const nested = await ml.createFolder("2024", source);
    const alpha = await ml.createProject({ label: "Alpha", description: "Donor 14" }, source);
    await ml.createProject({ label: "Beta" }, nested);
    const pipeline = await storeTemplate(ml, "Pipeline", "Clonotyping, then clustering");
    await move(ml, { kind: "template", id: pipeline }, nested);

    // The destination already holds a folder of the shared root's name.
    const inbox = await ml.createFolder("Inbox");
    await ml.createFolder("Repertoires", inbox);

    const shared = await ml.shareFolder(source, { everyone: true, title: "Repertoires" });
    const outcome = await ml.copyShare([shared.shareId], inbox);

    expect(outcome.failed).toStrictEqual([]);
    expect(outcome.projects).toHaveLength(2);
    expect(outcome.templates).toHaveLength(1);

    const listing = await untilListing(
      ml,
      (l) => l.projects.length === 4 && l.templates.length === 2 && l.folders.length === 6,
    );

    // Only the root lands beside what the destination already holds, so only the root is renamed.
    const root = listing.folders.find((f) => f.parent === inbox && f.name !== "Repertoires");
    if (root === undefined) throw new Error("the shared folder was not rebuilt in the destination");
    expect(root.name).toBe("Repertoires (Copy)");
    expect(root.description).toBe("Every donor, both replicates");

    const inside = listing.folders.filter((f) => f.ancestors.includes(root.id));
    expect(inside.map((f) => f.name)).toStrictEqual(["2024"]);
    const rebuilt = inside[0];
    expect(rebuilt.parent).toBe(root.id);

    // Every copy lands in the rebuilt counterpart of the folder it was shared from.
    const copies = listing.projects.filter((p) => outcome.projects.includes(p.id));
    const alphaCopy = copies.find((p) => p.meta.label === "Alpha");
    expect(alphaCopy?.folder).toBe(root.id);
    expect(alphaCopy?.meta.description).toBe("Donor 14");
    expect(copies.find((p) => p.meta.label === "Beta")?.folder).toBe(rebuilt.id);

    const pipelineCopy = listing.templates.find((t) => t.id === outcome.templates[0]);
    expect(pipelineCopy).toMatchObject({
      label: "Pipeline",
      description: "Clonotyping, then clustering",
      folder: rebuilt.id,
    });

    // The shared subtree itself is left where it was.
    expect(listing.projects.find((p) => p.id === alpha)?.folder).toBe(source);
    expect(listing.templates.find((t) => t.id === pipeline)?.folder).toBe(nested);
  });
});

test("a shared project copied into a folder lands there, named to fit beside what it holds", async () => {
  await withMl(async (ml) => {
    const source = await ml.createProject({ label: "Alpha" });
    const inbox = await ml.createFolder("Inbox");
    await ml.createProject({ label: "Alpha" }, inbox);

    const shared = await ml.shareProjects([source], {
      everyone: true,
      title: "Alpha",
      mode: "copy",
    });
    const outcome = await ml.copyShare([shared.shareId], inbox);

    expect(outcome.failed).toStrictEqual([]);
    expect(outcome.projects).toHaveLength(1);

    const listing = await untilListing(ml, (l) => l.projects.length === 3);
    const copy = listing.projects.find((p) => p.id === outcome.projects[0]);
    expect(copy?.folder).toBe(inbox);
    expect(copy?.meta.label).toBe("Alpha (Copy)");
    expect(listing.projects.find((p) => p.id === source)?.folder).toBeUndefined();
  });
});

test("replacing a project share leaves one share, under a new id", async () => {
  await withMl(async (ml) => {
    const project = await ml.createProject({ label: "Alpha" });

    const first = await ml.shareProjects([project], {
      everyone: true,
      title: "Alpha",
      mode: "copy",
    });
    const replacement = await ml.shareProjects([project], {
      everyone: true,
      title: "Alpha, again",
      mode: "copy",
      replace: [first.shareId],
    });
    expect(replacement.shareId).not.toBe(first.shareId);

    // The replaced share is deleted in the transaction that creates its replacement, so the
    // outbox never holds both.
    const outgoing = (await ml.outgoingShares.getValue()) ?? [];
    expect(outgoing.map((s) => s.shareId)).toStrictEqual([replacement.shareId]);
    expect(outgoing[0]).toMatchObject({ payloadKind: "projects", title: "Alpha, again" });
    expect(outgoing[0].projects.map((p) => p.projectId)).toStrictEqual([project]);
  });
});

//
// Internals
//

/** Stores an empty template at the top level and returns its id. */
async function storeTemplate(
  ml: MiddleLayer,
  label: string,
  description: string,
): Promise<TemplateId> {
  const rid = await ml.pl.withWriteTx("TestStoreTemplate", async (tx) => {
    const listRid = await ensureTemplateListRid(tx);
    const tpl = createTemplate(
      tx,
      listRid,
      { label, description },
      { schemaVersion: 1, document: { schema: PROJECT_TEMPLATE_SCHEMA_V1, blocks: [] } },
    );
    await tx.commit();
    return await tpl.globalId;
  });
  return resourceIdToString(rid) as TemplateId;
}

/** Moves one item with its own fresh plan, for the steps a test only needs as setup. */
async function move(ml: MiddleLayer, item: FoldersItem, destination: FolderId): Promise<void> {
  const planned = await ml.previewFoldersMove([item], destination);
  if (!planned.ok) throw new Error(`cannot plan move: ${JSON.stringify(planned.issues)}`);
  const outcome = await ml.moveFolderItems([item], destination, planned.plan);
  if (!outcome.ok) throw new Error(`move refused: ${outcome.reason}`);
}

/**
 * The listing is fed by polled trees, so a test waits for the state it expects rather than
 * reading once.
 */
async function untilListing(
  ml: MiddleLayer,
  predicate: (listing: FoldersListing) => boolean,
): Promise<FoldersListing> {
  let last: FoldersListing | undefined = undefined;
  for (let attempt = 0; attempt < 60; attempt++) {
    last = await ml.folders.awaitStableValue();
    if (predicate(last)) return last;
    await tp.setTimeout(250);
  }
  throw new Error(`folder listing never matched; last value: ${JSON.stringify(last)}`);
}
