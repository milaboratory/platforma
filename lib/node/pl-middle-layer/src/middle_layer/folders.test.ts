import { expect, test } from "vitest";
import * as tp from "node:timers/promises";
import { randomUUID } from "node:crypto";
import type { SignedResourceId } from "@milaboratories/pl-client";
import { field, isNullSignedResourceId } from "@milaboratories/pl-client";
import type { FolderId, FoldersMovePlan } from "@milaboratories/pl-model-middle-layer";
import { withMlKeepingRoots, withMlOnUserRoot } from "../test/with_ml";
import type { ProjectId } from "../model/project_model";
import type { MiddleLayer } from "./middle_layer";
import type { FoldersListing } from "./folders";
import { FoldersDocumentField, FoldersField, ensureFoldersRid } from "./folders";
import type { TemplateId } from "./template_list";

// The file's roots outlive their tests and are deleted together after the last one, so the
// backend's cleanup of their projects never runs under this file's own writes.
const withMl = withMlKeepingRoots();

/**
 * The folder feature end to end against a live backend: the singleton slot, the joined read, the
 * one write helper, and the move contract.
 *
 * Needs a backend, like every `withMl` test in this package, and no gate: `PL_ADDRESS` is either
 * configured or the client fails to connect.
 */

test("a user with no folders sees every project at the top level", async () => {
  await withMl(async (ml) => {
    const project = await ml.createProject({ label: "Alpha" });

    const listing = await untilListing(ml, (l) => l.projects.length === 1);
    expect(listing.folders).toStrictEqual([]);
    expect(listing.writable).toBe(true);
    expect(listing.healed).toBe(false);
    expect(listing.problem).toBeUndefined();
    expect(listing.projects[0].id).toBe(project);
    expect(listing.projects[0].folder).toBeUndefined();
    expect(listing.projects[0].path).toStrictEqual([]);

    // Reading writes nothing. The singleton is made by init, but nothing has put a document in
    // it, so an account that never touches folders never grows one.
    expect(await singletonExists(ml)).toBe(true);
    expect(await documentFieldExists(ml)).toBe(false);
  });
});

test("folders nest to any depth", async () => {
  await withMl(async (ml) => {
    const one = await ml.createFolder("One");
    const two = await ml.createFolder("Two", one);
    const three = await ml.createFolder("Three", two);
    const four = await ml.createFolder("Four", three);

    const listing = await untilListing(ml, (l) => l.folders.length === 4);
    expect(depthOf(listing, one)).toBe(1);
    expect(depthOf(listing, two)).toBe(2);
    expect(depthOf(listing, three)).toBe(3);
    expect(depthOf(listing, four)).toBe(4);
    expect(listing.folders.find((f) => f.id === four)?.path).toStrictEqual([
      "One",
      "Two",
      "Three",
      "Four",
    ]);
  });
});

test("a typed name is stored trimmed, and a blank folder name is refused", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("  Samples  ");
    const project = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 1);
    await ml.setProjectMeta(project, { label: "  Beta  " });

    const listing = await untilListing(ml, (l) => labelOf(l, project) === "Beta");
    expect(listing.folders.find((f) => f.id === folder)?.name).toBe("Samples");

    await expect(ml.createFolder("   ")).rejects.toThrow(/cannot be empty/);
    await expect(ml.renameFolder(folder, "   ")).rejects.toThrow(/cannot be empty/);
  });
});

test("a name a human typed is rejected when another folder carries it, whatever its case", async () => {
  await withMl(async (ml) => {
    await ml.createFolder("Samples");
    await expect(ml.createFolder("samples")).rejects.toThrow(
      'A folder named "samples" is already here.',
    );

    // A project is another kind of item: its name is no obstacle to a folder's.
    await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 1);
    await ml.createFolder("alpha");

    const other = await ml.createFolder("Other");
    await expect(ml.renameFolder(other, "SAMPLES")).rejects.toThrow(/folder named .* already here/);

    // Renaming a folder to what it is already called is not a collision with itself.
    await ml.renameFolder(other, "Other");
  });
});

test("moving a project into a folder gives it the folder's path and keeps it in the list", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const nested = await ml.createFolder("2024", folder);
    const project = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 1);

    const planned = await ml.previewFoldersMove([item(project)], nested);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.entries).toHaveLength(1);
    expect(planned.plan.entries[0].name).toBe("Alpha");
    expect(planned.plan.entries[0].renamed).toBe(false);

    const outcome = await ml.moveFolderItems([item(project)], nested, planned.plan);
    expect(outcome.ok).toBe(true);

    const listing = await untilListing(ml, (l) => l.projects[0]?.folder !== undefined);
    expect(listing.projects[0].folder).toBe(nested);
    expect(listing.projects[0].ancestors).toStrictEqual([folder, nested]);
    expect(listing.projects[0].path).toStrictEqual(["Samples", "2024"]);
    expect((await ml.projectList.awaitStableValue()).map((e) => e.id)).toStrictEqual([project]);
  });
});

test("a move into a taken name renames the moved project, and the rename is persisted", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const resident = await ml.createProject({ label: "Alpha" });
    const incoming = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 2);

    await move(ml, resident, folder);
    await untilListing(ml, (l) => l.projects.some((p) => p.folder === folder));

    const planned = await ml.previewFoldersMove([item(incoming)], folder);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.entries[0].name).toBe("Alpha (Copy)");
    expect(planned.plan.entries[0].renamed).toBe(true);

    expect((await ml.moveFolderItems([item(incoming)], folder, planned.plan)).ok).toBe(true);

    const listing = await untilListing(
      ml,
      (l) => l.projects.filter((p) => p.folder === folder).length === 2,
    );
    expect(labelOf(listing, incoming)).toBe("Alpha (Copy)");
    expect(labelOf(listing, resident)).toBe("Alpha");
  });
});

test("a plan confirmed against state that has since changed is refused and writes nothing", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const first = await ml.createProject({ label: "Alpha" });
    const second = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 2);

    // Confirmed while the folder is still empty, so it promises no rename.
    const confirmed = await ml.previewFoldersMove([item(first)], folder);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.plan.entries[0].renamed).toBe(false);

    // Somebody else takes the name in the meantime.
    await move(ml, second, folder);
    await untilListing(ml, (l) => l.projects.some((p) => p.folder === folder));

    const refused = await ml.moveFolderItems([item(first)], folder, confirmed.plan);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason).toBe("plan-changed");
    if (refused.reason !== "plan-changed") return;
    expect(refused.plan.entries[0].name).toBe("Alpha (Copy)");

    // Nothing was written: the project is still where it was, under the name it had.
    const listing = await untilListing(ml, (l) => l.projects.length === 2);
    expect(listing.projects.find((p) => p.id === first)?.folder).toBeUndefined();
    expect(labelOf(listing, first)).toBe("Alpha");

    // Re-confirming the fresh plan commits it.
    expect((await ml.moveFolderItems([item(first)], folder, refused.plan)).ok).toBe(true);
    const after = await untilListing(
      ml,
      (l) => l.projects.filter((p) => p.folder === folder).length === 2,
    );
    expect(labelOf(after, first)).toBe("Alpha (Copy)");
  });
});

test("deleting a folder destroys its whole subtree, projects included", async () => {
  await withMl(async (ml) => {
    const outer = await ml.createFolder("Outer");
    const inner = await ml.createFolder("Inner", outer);
    const deep = await ml.createFolder("Deep", inner);
    const doomed = await ml.createProject({ label: "Alpha" });
    const spared = await ml.createProject({ label: "Beta" });
    await untilListing(ml, (l) => l.projects.length === 2);
    await move(ml, doomed, deep);
    await untilListing(ml, (l) => l.projects.some((p) => p.folder === deep));

    const planned = await ml.previewFolderDeletion(inner);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect([...planned.removal.folders].sort()).toStrictEqual([inner, deep].sort());
    expect(planned.removal.projects).toStrictEqual([doomed]);

    expect((await ml.deleteFolder(inner, planned.removal)).ok).toBe(true);

    const listing = await untilListing(ml, (l) => l.folders.length === 1);
    expect(listing.folders.map((f) => f.id)).toStrictEqual([outer]);
    // The project inside is gone from the project list itself, not merely from the tree.
    expect(listing.projects.map((p) => p.id)).toStrictEqual([spared]);
  });
});

test("deleting a folder whose project shares a name with one at the top level", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Holder");
    const inside = await ml.createProject({ label: "Alpaca" });
    await untilListing(ml, (l) => l.projects.length === 1);
    await move(ml, inside, folder);
    await untilListing(ml, (l) => l.projects.some((p) => p.folder === folder));
    const outside = await ml.createProject({ label: "Alpaca" });
    await untilListing(ml, (l) => l.projects.length === 2);

    const planned = await ml.previewFolderDeletion(folder);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    // The deleted project leaves no folder behind to stand in, so it must not be counted at the
    // top level beside the "Alpaca" that is really there.
    expect((await ml.deleteFolder(folder, planned.removal)).ok).toBe(true);

    const listing = await untilListing(ml, (l) => l.folders.length === 0);
    expect(listing.projects.map((p) => p.id)).toStrictEqual([outside]);
  });
});

test("a deletion is refused when the subtree changed after the dialog read it", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Outer");
    const first = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 1);
    await move(ml, first, folder);
    await untilListing(ml, (l) => l.projects[0]?.folder === folder);

    const planned = await ml.previewFolderDeletion(folder);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    // A second project lands in the folder between the preview and the write.
    const latecomer = await ml.createProject({ label: "Beta" });
    await untilListing(ml, (l) => l.projects.length === 2);
    await move(ml, latecomer, folder);
    await untilListing(ml, (l) => l.projects.filter((p) => p.folder === folder).length === 2);

    const outcome = await ml.deleteFolder(folder, planned.removal);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    if (outcome.reason === "cannot-plan") throw new Error("expected a fresh removal");
    expect(outcome.reason).toBe("plan-changed");
    expect(outcome.removal.projects).toContain(latecomer);

    // Nothing was written: both projects and the folder are still there.
    const listing = await untilListing(ml, (l) => l.projects.length === 2);
    expect(listing.folders.map((f) => f.id)).toStrictEqual([folder]);
  });
});

test("a stored tree that cannot be honoured is healed on read, not hidden", async () => {
  await withMl(async (ml) => {
    const project = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 1);

    await writeRawDocument(ml, {
      schemaVersion: 1,
      folders: [
        { id: "orphan", name: "Orphan", parent: "gone" },
        { id: "child", name: "Child", parent: "orphan" },
      ],
      assignments: { [project]: "child", ghost: "orphan" },
      templateAssignments: {},
    });

    const listing = await untilListing(ml, (l) => l.folders.length === 2);
    expect(listing.healed).toBe(true);
    expect(listing.writable).toBe(true);
    expect(depthOf(listing, "orphan" as FolderId)).toBe(1);
    // The lifted folder keeps its own subtree beneath it.
    expect(depthOf(listing, "child" as FolderId)).toBe(2);
    expect(listing.projects[0].id).toBe(project);
    expect(listing.projects[0].path).toStrictEqual(["Orphan", "Child"]);
  });
});

test("a document written by a newer build reads as no folders and refuses every write", async () => {
  await withMl(async (ml) => {
    const project = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 1);

    await writeRawDocument(ml, { schemaVersion: 99, folders: [], assignments: {} });

    const listing = await untilListing(ml, (l) => !l.writable);
    expect(listing.folders).toStrictEqual([]);
    // The project list still renders — the read degrades, it does not fail.
    expect(listing.projects.map((p) => p.id)).toStrictEqual([project]);
    expect(listing.problem?.kind).toBe("newer-schema");

    await expect(ml.createFolder("Samples")).rejects.toThrow(/Update the application/);
    await expect(ml.deleteFolder("whatever" as FolderId)).rejects.toThrow(/Update the application/);
  });
});

test("a document stored in a shape this build cannot read is never written over", async () => {
  await withMl(async (ml) => {
    const project = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 1);

    // What a build that kept the tree in some other resource shape would leave behind: the field
    // exists and points at something, and there is no JSON blob on it. Absent and unreadable must
    // not be the same thing here — an absent document is a user with no folders and is writable,
    // and treating this as that would replace whatever is stored with an empty tree.
    const foreign = await writeDataLessDocumentResource(ml);

    await expect(ml.createFolder("Samples")).rejects.toThrow(/Update the application/);
    await expect(ml.deleteFolder("whatever" as FolderId)).rejects.toThrow(/Update the application/);
    await expect(ml.moveFolderItems([item(project)], undefined, { entries: [] })).rejects.toThrow(
      /Update the application/,
    );

    // Nothing was written: the field still points at exactly what was there before.
    expect(await documentValueRid(ml)).toStrictEqual(foreign);
  });
});

test("a document written by a newer build can be reset to no folders", async () => {
  await withMl(async (ml) => {
    const project = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 1);

    await writeRawDocument(ml, {
      schemaVersion: 99,
      folders: [{ id: "newer", name: "Newer" }],
      assignments: { [project]: "newer" },
    });
    await untilListing(ml, (l) => l.problem?.kind === "newer-schema");

    await ml.resetFolders();

    const listing = await untilListing(ml, (l) => l.writable);
    expect(listing.problem).toBeUndefined();
    expect(listing.folders).toStrictEqual([]);
    expect(listing.projects.map((p) => p.id)).toStrictEqual([project]);
    expect(listing.projects[0].folder).toBeUndefined();

    const reset = await documentValueRid(ml);
    if (reset === undefined) throw new Error("the reset left no document behind");
    expect(await rawDocumentAt(ml, reset)).toStrictEqual({
      schemaVersion: 1,
      folders: [],
      assignments: {},
      templateAssignments: {},
    });

    // The tree is ours again, so folder writes go through.
    await ml.createFolder("Samples");
    await untilListing(ml, (l) => l.folders.length === 1);
  });
});

test("a document stored in a shape this build cannot read can be reset to no folders", async () => {
  await withMl(async (ml) => {
    const project = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 1);

    const foreign = await writeDataLessDocumentResource(ml);
    await untilListing(ml, (l) => l.problem?.kind === "unreadable");

    await ml.resetFolders();

    const listing = await untilListing(ml, (l) => l.writable);
    expect(listing.problem).toBeUndefined();
    expect(listing.folders).toStrictEqual([]);
    expect(listing.projects.map((p) => p.id)).toStrictEqual([project]);
    expect(await documentValueRid(ml)).not.toStrictEqual(foreign);
  });
});

test("a document that reads fine is never reset", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const project = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 1);
    await move(ml, project, folder);
    await untilListing(ml, (l) => l.projects[0]?.folder === folder);
    const before = await documentValueRid(ml);

    await expect(ml.resetFolders()).rejects.toThrow(/can only be reset when they cannot be read/);

    expect(await documentValueRid(ml)).toStrictEqual(before);
    const listing = await untilListing(ml, (l) => l.folders.length === 1);
    expect(listing.projects[0].folder).toBe(folder);
  });
});

test("a user with no folder document is never reset", async () => {
  await withMl(async (ml) => {
    await expect(ml.resetFolders()).rejects.toThrow(/can only be reset when they cannot be read/);
    expect(await documentFieldExists(ml)).toBe(false);
  });
});

test("a move of nothing writes nothing", async () => {
  await withMl(async (ml) => {
    await ml.createFolder("Samples");
    const before = await documentValueRid(ml);

    const outcome = await ml.moveFolderItems([], undefined, { entries: [] });

    expect(outcome.ok).toBe(true);
    // No value was minted and the field was not re-pointed, so an empty selection cannot conflict
    // with whatever else is editing the tree.
    expect(await documentValueRid(ml)).toStrictEqual(before);
  });
});

test("every write mints a new value resource and re-points the one document field", async () => {
  await withMl(async (ml) => {
    await ml.createFolder("First");
    const firstValue = await documentValueRid(ml);
    await ml.createFolder("Second");
    const secondValue = await documentValueRid(ml);

    expect(firstValue).toBeDefined();
    expect(secondValue).not.toBe(firstValue);

    // Nothing was mutated: the value the field used to point at still holds the old document.
    if (firstValue === undefined) throw new Error("the first write stored no value");
    const superseded = await documentAt(ml, firstValue);
    expect(superseded?.folders.map((f) => f.name)).toStrictEqual(["First"]);

    const listing = await untilListing(ml, (l) => l.folders.length === 2);
    expect(listing.folders.map((f) => f.name).sort()).toStrictEqual(["First", "Second"]);
  });
});

test("a move preview names exactly the items the applied move renames", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const resident = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 1);
    await move(ml, resident, folder);
    await untilListing(ml, (l) => l.projects.some((p) => p.folder === folder));

    // Two of the three collide with the resident — one exactly, one only case-insensitively.
    const colliding = await ml.createProject({ label: "Alpha" });
    const distinct = await ml.createProject({ label: "Beta" });
    const alsoColliding = await ml.createProject({ label: "alpha" });
    await untilListing(ml, (l) => l.projects.length === 4);

    const items = [item(colliding), item(distinct), item(alsoColliding)];
    const planned = await ml.previewFoldersMove(items, folder);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    const promised = new Map(planned.plan.entries.map((e) => [e.item.id as ProjectId, e]));
    expect([...promised.keys()].sort()).toStrictEqual([colliding, distinct, alsoColliding].sort());
    expect(
      [...promised.values()]
        .filter((e) => e.renamed)
        .map((e) => e.item.id)
        .sort(),
    ).toStrictEqual([colliding, alsoColliding].sort());

    expect((await ml.moveFolderItems(items, folder, planned.plan)).ok).toBe(true);
    const listing = await untilListing(
      ml,
      (l) => l.projects.filter((p) => p.folder === folder).length === 4,
    );

    // Every item carries exactly the name the preview promised it, renamed or not, and the
    // resident the plan never mentioned is untouched.
    for (const [id, entry] of promised) expect(labelOf(listing, id)).toBe(entry.name);
    expect(labelOf(listing, resident)).toBe("Alpha");
  });
});

test("a move that would nest a folder inside itself is refused by the write path", async () => {
  await withMl(async (ml) => {
    const outer = await ml.createFolder("Outer");
    const inner = await ml.createFolder("Inner", outer);
    await untilListing(ml, (l) => l.folders.length === 2);

    const planned = await ml.previewFoldersMove([folderItem(outer)], inner);
    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.issues.map((i) => i.kind)).toContain("into-own-descendant");

    // The write refuses it on its own account, handed a plan the planner would never produce.
    const refused = await ml.moveFolderItems([folderItem(outer)], inner, {
      destination: inner,
      entries: [{ item: folderItem(outer), currentName: "Outer", name: "Outer", renamed: false }],
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason).toBe("cannot-plan");
    if (refused.reason !== "cannot-plan") return;
    expect(refused.issues.map((i) => i.kind)).toContain("into-own-descendant");

    const listing = await untilListing(ml, (l) => l.folders.length === 2);
    expect(listing.folders.find((f) => f.id === outer)?.parent).toBeUndefined();
    expect(listing.folders.find((f) => f.id === inner)?.parent).toBe(outer);
  });
});

test("a subtree moves under another folder whole, however deep it then reaches", async () => {
  await withMl(async (ml) => {
    const one = await ml.createFolder("One");
    const two = await ml.createFolder("Two", one);
    const three = await ml.createFolder("Three", two);
    const elsewhere = await ml.createFolder("Elsewhere");
    await untilListing(ml, (l) => l.folders.length === 4);

    const planned = await ml.previewFoldersMove([folderItem(one)], elsewhere);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect((await ml.moveFolderItems([folderItem(one)], elsewhere, planned.plan)).ok).toBe(true);

    const listing = await untilListing(ml, (l) => depthOf(l, one) === 2);
    expect(listing.folders.find((f) => f.id === one)?.parent).toBe(elsewhere);
    expect(depthOf(listing, three)).toBe(4);
    expect(listing.folders.find((f) => f.id === three)?.path).toStrictEqual([
      "Elsewhere",
      "One",
      "Two",
      "Three",
    ]);
  });
});

test("a project deleted behind the tree's back does not break the read or the next write", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const kept = await ml.createProject({ label: "Kept" });
    const doomed = await ml.createProject({ label: "Doomed" });
    await untilListing(ml, (l) => l.projects.length === 2);
    await move(ml, kept, folder);
    await move(ml, doomed, folder);
    await untilListing(ml, (l) => l.projects.filter((p) => p.folder === folder).length === 2);

    // Deletion goes nowhere near the folder document, which is left naming a project that is gone.
    await ml.deleteProject(doomed);

    const listing = await untilListing(ml, (l) => l.projects.length === 1);
    expect(listing.projects[0].id).toBe(kept);
    expect(listing.projects[0].folder).toBe(folder);
    expect(listing.folders.map((f) => f.id)).toStrictEqual([folder]);
    expect(listing.writable).toBe(true);
    expect(listing.problem).toBeUndefined();

    const second = await ml.createFolder("Second");
    const after = await untilListing(ml, (l) => l.folders.length === 2);
    expect(after.folders.map((f) => f.id).sort()).toStrictEqual([folder, second].sort());
    expect(after.projects.map((p) => p.id)).toStrictEqual([kept]);
  });
});

test("the tree survives a restart of the middle layer", async () => {
  // Names of their own: the user's root keeps whatever other tests and earlier runs left there.
  const name = `Samples ${randomUUID()}`;
  let folder: FolderId | undefined = undefined;
  let project: ProjectId | undefined = undefined;

  try {
    await withMlOnUserRoot(async (ml) => {
      const created = await ml.createFolder(name);
      folder = created;
      const prj = await ml.createProject({ label: `Alpha ${randomUUID()}` });
      project = prj;
      await untilListing(ml, (l) => l.projects.some((p) => p.id === prj));
      await move(ml, prj, created);
      await untilListing(ml, (l) => l.projects.some((p) => p.id === prj && p.folder === created));
    });

    if (folder === undefined || project === undefined)
      throw new Error("setup did not produce a folder and a project");
    const storedFolder: FolderId = folder;
    const storedProject: ProjectId = project;

    // A second middle layer over a work folder of its own: nothing local carries over, so what
    // comes back can only have come from the backend.
    await withMlOnUserRoot(async (ml) => {
      const listing = await untilListing(ml, (l) =>
        l.projects.some((p) => p.id === storedProject && p.folder === storedFolder),
      );
      expect(listing.folders.find((f) => f.id === storedFolder)?.name).toBe(name);
      expect(listing.projects.find((p) => p.id === storedProject)?.path).toStrictEqual([name]);
      expect(listing.writable).toBe(true);

      // And it is still the same document being written to, not a fresh one.
      const nested = await ml.createFolder("2024", storedFolder);
      const after = await untilListing(ml, (l) => l.folders.some((f) => f.id === nested));
      expect(after.folders.find((f) => f.id === nested)?.parent).toBe(storedFolder);
    });
  } finally {
    // Deleting the folder takes the project and the nested folder with it.
    await withMlOnUserRoot(async (ml) => {
      if (folder !== undefined) {
        const planned = await ml.previewFolderDeletion(folder);
        if (planned.ok) await ml.deleteFolder(folder, planned.removal);
      }
      if (project !== undefined) await ml.deleteProject(project).catch(() => undefined);
    });
  }
});

test("renaming a project onto a sibling's name is refused, in whatever case", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const resident = await ml.createProject({ label: "Alpha" });
    const other = await ml.createProject({ label: "Beta" });
    await untilListing(ml, (l) => l.projects.length === 2);
    await move(ml, resident, folder);
    await move(ml, other, folder);
    await untilListing(ml, (l) => l.projects.filter((p) => p.folder === folder).length === 2);

    await expect(ml.setProjectMeta(other, { label: "Alpha" })).rejects.toThrow(
      'A project named "Alpha" is already here.',
    );
    await expect(ml.setProjectMeta(other, { label: "ALPHA" })).rejects.toThrow(
      /project named .* already here/,
    );

    // Nothing was written by either refusal.
    const listing = await untilListing(ml, (l) => l.projects.length === 2);
    expect(labelOf(listing, other)).toBe("Beta");
    expect(labelOf(listing, resident)).toBe("Alpha");

    // A folder is another kind of item: a project may take the name of one beside it.
    await ml.createFolder("Archive", folder);
    await ml.setProjectMeta(other, { label: "archive" });
    await untilListing(ml, (l) => labelOf(l, other) === "archive");
  });
});

test("the same project name in two different folders is allowed", async () => {
  await withMl(async (ml) => {
    const here = await ml.createFolder("Here");
    const there = await ml.createFolder("There");
    const first = await ml.createProject({ label: "Alpha" });
    const second = await ml.createProject({ label: "Beta" });
    await untilListing(ml, (l) => l.projects.length === 2);
    await move(ml, first, here);
    await move(ml, second, there);
    await untilListing(ml, (l) => l.projects.every((p) => p.folder !== undefined));

    // Per parent, not globally — this is the whole point of the scope.
    await ml.setProjectMeta(second, { label: "Alpha" });
    const listing = await untilListing(ml, (l) => labelOf(l, second) === "Alpha");
    expect(labelOf(listing, first)).toBe("Alpha");
    expect(listing.projects.find((p) => p.id === first)?.folder).toBe(here);
    expect(listing.projects.find((p) => p.id === second)?.folder).toBe(there);
  });
});

test("a project is never in collision with itself", async () => {
  await withMl(async (ml) => {
    const project = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 1);

    await ml.setProjectMeta(project, { label: "Alpha" });
    await ml.setProjectMeta(project, { label: "ALPHA" });

    const listing = await untilListing(ml, (l) => labelOf(l, project) === "ALPHA");
    expect(listing.projects).toHaveLength(1);
  });
});

test("a collision an account already holds is tolerated, not rewritten and not a dead end", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const first = await ml.createProject({ label: "Alpha" });
    const second = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 2);

    // Straight into the slot: no path through the folder machinery would ever produce this, which
    // is exactly what an account predating the feature may nonetheless be holding.
    await writeRawDocument(ml, {
      schemaVersion: 1,
      folders: [{ id: folder, name: "Samples" }],
      assignments: { [first]: folder, [second]: folder },
      templateAssignments: {},
    });

    const colliding = await untilListing(
      ml,
      (l) => l.projects.filter((p) => p.folder === folder).length === 2,
    );
    expect(labelOf(colliding, first)).toBe("Alpha");
    expect(labelOf(colliding, second)).toBe("Alpha");

    // Neither is stuck: a free name is still accepted, and nothing rewrote the pair on its own.
    await ml.setProjectMeta(second, { label: "Beta" });
    const listing = await untilListing(ml, (l) => labelOf(l, second) === "Beta");
    expect(labelOf(listing, first)).toBe("Alpha");
  });
});

test("a folder document this build cannot read does not block a project rename", async () => {
  await withMl(async (ml) => {
    const first = await ml.createProject({ label: "Alpha" });
    const second = await ml.createProject({ label: "Beta" });
    await untilListing(ml, (l) => l.projects.length === 2);

    await writeRawDocument(ml, { schemaVersion: 99, folders: [], assignments: {} });
    await untilListing(ml, (l) => !l.writable);

    // The tree is unreadable, so where these two sit is unknown — refusing on the flat reading
    // would turn a per-parent rule into a global one and block a rename that may be legal.
    await ml.setProjectMeta(second, { label: "Alpha" });
    const listing = await untilListing(ml, (l) => labelOf(l, second) === "Alpha");
    expect(labelOf(listing, first)).toBe("Alpha");
    expect(listing.writable).toBe(false);
  });
});

test("a project that is open when a move renames it keeps the name the move gave it", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const resident = await ml.createProject({ label: "Alpha" });
    const incoming = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 2);
    await move(ml, resident, folder);
    await untilListing(ml, (l) => l.projects.some((p) => p.folder === folder));

    // Open before the move and left open across it: the state the rename is supposed to be lost
    // in — a project whose maintenance loop is running while something else writes its label.
    await ml.openProject(incoming);
    try {
      const planned = await ml.previewFoldersMove([item(incoming)], folder);
      expect(planned.ok).toBe(true);
      if (!planned.ok) return;
      expect(planned.plan.entries[0].name).toBe("Alpha (Copy)");

      expect((await ml.moveFolderItems([item(incoming)], folder, planned.plan)).ok).toBe(true);
      await untilListing(ml, (l) => labelOf(l, incoming) === "Alpha (Copy)");

      // Several passes of that loop. Each one loads a mutator and calls save(); a mutator holding
      // a pre-move label would put it back here.
      await tp.setTimeout(3 * ProjectRefreshPass);
      expect(labelOf(await ml.folders.awaitStableValue(), incoming)).toBe("Alpha (Copy)");
    } finally {
      await ml.closeProject(incoming);
    }

    // Re-opening applies migrations and then a deliberate no-op mutation — the heaviest save the
    // project path performs without anyone having asked for one.
    await ml.openProject(incoming);
    try {
      await tp.setTimeout(2 * ProjectRefreshPass);
      const listing = await ml.folders.awaitStableValue();
      expect(labelOf(listing, incoming)).toBe("Alpha (Copy)");
      expect(listing.projects.find((p) => p.id === incoming)?.folder).toBe(folder);
      expect(labelOf(listing, resident)).toBe("Alpha");
    } finally {
      await ml.closeProject(incoming);
    }
  });
});

test("a rename racing a move loses neither: whoever commits second sees the other", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const resident = await ml.createProject({ label: "Alpha" });
    const incoming = await ml.createProject({ label: "Alpha" });
    await untilListing(ml, (l) => l.projects.length === 2);
    await move(ml, resident, folder);
    await untilListing(ml, (l) => l.projects.some((p) => p.folder === folder));

    const planned = await ml.previewFoldersMove([item(incoming)], folder);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.entries[0].name).toBe("Alpha (Copy)");

    // Both writers read and write the same metadata key inside their own write transaction, so
    // one of them is aborted and replayed. Which one is not ours to choose; what must hold is
    // that the loser re-reads instead of putting its stale idea of the label back.
    const [moved, renamed] = await Promise.allSettled([
      ml.moveFolderItems([item(incoming)], folder, planned.plan),
      ml.setProjectMeta(incoming, { label: "Gamma" }),
    ]);

    const listing = await untilListing(ml, (l) => labelOf(l, incoming) !== "Alpha");
    const label = labelOf(listing, incoming);

    // "Alpha" is the one answer nobody decided on: it is the name the move took away and the name
    // the rename replaced. Seeing it means a writer wrote back what it read before the other ran.
    expect(label).not.toBe("Alpha");
    expect(["Alpha (Copy)", "Gamma"]).toContain(label);
    expect(labelOf(listing, resident)).toBe("Alpha");

    // A move that reported success placed the project; one refused as `plan-changed` wrote
    // nothing at all, and the rename is then the only thing that happened.
    if (moved.status === "fulfilled" && moved.value.ok)
      expect(listing.projects.find((p) => p.id === incoming)?.folder).toBe(folder);
    if (renamed.status === "fulfilled" && label === "Gamma")
      expect(listing.projects).toHaveLength(2);
  });
});

test("a whitespace-only description clears what a folder said about itself", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    await ml.setFolderDescription(folder, "  Plates  ");
    const described = await untilListing(ml, (l) => l.folders[0]?.description !== undefined);
    expect(described.folders[0].description).toBe("Plates");

    await ml.setFolderDescription(folder, "   ");
    const cleared = await untilListing(ml, (l) => l.folders[0]?.description === undefined);
    expect(cleared.folders[0]).not.toHaveProperty("description");
  });
});

test("a project created into a folder lands there, and into a deleted one at the top level", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const doomed = await ml.createFolder("Doomed");
    const inside = await ml.createProject({ label: "Alpha" }, folder);

    const planned = await ml.previewFolderDeletion(doomed);
    if (!planned.ok) throw new Error("expected a removal");
    expect((await ml.deleteFolder(doomed, planned.removal)).ok).toBe(true);
    const stray = await ml.createProject({ label: "Beta" }, doomed);

    const listing = await untilListing(ml, (l) => l.projects.length === 2);
    expect(listing.projects.find((p) => p.id === inside)?.folder).toBe(folder);
    expect(listing.projects.find((p) => p.id === stray)?.folder).toBeUndefined();
  });
});

test("a duplicated project lands beside its source, under a name free there", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const source = await ml.createProject({ label: "Alpha" }, folder);

    const copy = await ml.duplicateProject(source);

    const listing = await untilListing(ml, (l) => l.projects.length === 2);
    expect(listing.projects.find((p) => p.id === copy)?.folder).toBe(folder);
    expect(labelOf(listing, copy)).toBe("Alpha (Copy)");
    expect(labelOf(listing, source)).toBe("Alpha");
  });
});

test("a template saved from a project lands beside it", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const project = await ml.createProject({ label: "Alpha" }, folder);

    const saved = await ml.saveProjectAsTemplate(project);
    if (!saved.ok) throw new Error("the project could not be saved as a template");

    const listing = await untilListing(ml, (l) => l.templates.length === 1);
    expect(listing.templates[0].id).toBe(saved.templateId);
    expect(listing.templates[0].folder).toBe(folder);
    // The project beside it answers to that label too, but a project is another kind of item.
    expect(listing.templates[0].label).toBe("Alpha");
  });
});

test("a template saved from a project carries the description it is given, and only that", async () => {
  await withMl(async (ml) => {
    const project = await ml.createProject({ label: "Alpha", description: "First pass" });

    const described = await ml.saveProjectAsTemplate(project, "Described", "  Reusable  ");
    const blank = await ml.saveProjectAsTemplate(project, "Blank", "   ");
    const undescribed = await ml.saveProjectAsTemplate(project, "Undescribed");
    if (!described.ok || !blank.ok || !undescribed.ok)
      throw new Error("the project could not be saved as a template");

    const listing = await untilListing(ml, (l) => l.templates.length === 3);
    const descriptionOf = (id: TemplateId) =>
      listing.templates.find((t) => t.id === id)?.description;
    expect(descriptionOf(described.templateId)).toBe("Reusable");
    expect(descriptionOf(blank.templateId)).toBeUndefined();
    // The project's own description is not taken over when none is given.
    expect(descriptionOf(undescribed.templateId)).toBeUndefined();
  });
});

test("duplicating a folder rebuilds its subtree beside it, descriptions and all", async () => {
  await withMl(async (ml) => {
    const outer = await ml.createFolder("Outer");
    const source = await ml.createFolder("Samples", outer);
    const inner = await ml.createFolder("Runs", source);
    await ml.setFolderDescription(inner, "Weekly runs");
    const project = await ml.createProject({ label: "Alpha", description: "First pass" }, inner);
    const saved = await ml.saveProjectAsTemplate(project);
    if (!saved.ok) throw new Error("the project could not be saved as a template");
    await ml.setTemplateDescription(saved.templateId, "Reusable");
    await untilListing(ml, (l) => l.templates.some((t) => t.description === "Reusable"));

    await ml.duplicateFolder(source);

    const listing = await untilListing(ml, (l) => l.folders.length === 5);
    const copy = listing.folders.find((f) => f.parent === outer && f.id !== source);
    if (copy === undefined) throw new Error("no copy beside the source");
    expect(copy.name).toBe("Samples (Copy)");

    const copiedInner = listing.folders.find((f) => f.parent === copy.id);
    if (copiedInner === undefined) throw new Error("the copy holds no folder");
    expect(copiedInner.name).toBe("Runs");
    expect(copiedInner.description).toBe("Weekly runs");

    const copiedProject = listing.projects.find((p) => p.id !== project);
    expect(copiedProject?.folder).toBe(copiedInner.id);
    expect(copiedProject?.meta).toStrictEqual({ label: "Alpha", description: "First pass" });

    const copiedTemplate = listing.templates.find((t) => t.id !== saved.templateId);
    expect(copiedTemplate?.folder).toBe(copiedInner.id);
    expect(copiedTemplate?.label).toBe("Alpha");
    expect(copiedTemplate?.description).toBe("Reusable");
  });
});

test("what a deleted folder held is gone for good, not only from the tree", async () => {
  await withMl(async (ml) => {
    const folder = await ml.createFolder("Samples");
    const project = await ml.createProject({ label: "Alpha" }, folder);
    const saved = await ml.saveProjectAsTemplate(project);
    if (!saved.ok) throw new Error("the project could not be saved as a template");
    const template: TemplateId = saved.templateId;

    const planned = await ml.previewFolderDeletion(folder);
    if (!planned.ok) throw new Error("expected a removal");
    expect((await ml.deleteFolder(folder, planned.removal)).ok).toBe(true);

    // Both ids were resolved moments ago; neither may still resolve to what the folder held.
    await expect(ml.setProjectMeta(project, { label: "Beta" })).rejects.toThrow(/not found/);
    await expect(ml.renameTemplate(template, "Gamma")).rejects.toThrow(/not found/);
  });
});

//
// Internals
//

/** One pass of an open project's maintenance loop, at the middle layer's default interval. */
const ProjectRefreshPass = 2000;

function item(project: ProjectId) {
  return { kind: "project", id: project } as const;
}

function folderItem(folder: FolderId) {
  return { kind: "folder", id: folder } as const;
}

/** 1 for a top-level folder. */
function depthOf(listing: FoldersListing, folder: FolderId): number | undefined {
  const found = listing.folders.find((f) => f.id === folder);
  return found === undefined ? undefined : found.ancestors.length + 1;
}

function labelOf(listing: FoldersListing, project: ProjectId): string | undefined {
  return listing.projects.find((p) => p.id === project)?.meta.label;
}

/** Moves one project with its own fresh plan, for the steps a test only needs as setup. */
async function move(ml: MiddleLayer, project: ProjectId, destination: FolderId) {
  const planned = await ml.previewFoldersMove([item(project)], destination);
  if (!planned.ok) throw new Error(`cannot plan move: ${JSON.stringify(planned.issues)}`);
  const plan: FoldersMovePlan = planned.plan;
  const outcome = await ml.moveFolderItems([item(project)], destination, plan);
  if (!outcome.ok) throw new Error(`move refused: ${outcome.reason}`);
}

/**
 * The listing is fed by two polled trees, and a write made outside the middle layer's own helpers
 * has nothing to refresh them with, so a test waits for the state it expects rather than reading
 * once.
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

/** Writes a document straight into the slot, to stage what only a foreign writer could store. */
async function writeRawDocument(ml: MiddleLayer, document: unknown): Promise<void> {
  await ml.pl.withWriteTx("TestWriteFoldersDocument", async (tx) => {
    const rid = await ensureFoldersRid(tx);
    const f = field(rid, FoldersDocumentField);
    const ref = tx.createJsonValue(document);
    if (await tx.fieldExists(f)) tx.setField(f, ref);
    else tx.createField(f, "Dynamic", ref);
    await tx.commit();
  });
}

/**
 * Points the document field at a resource that carries no blob at all, which is what a build
 * storing the tree in some other shape would leave for this one to find. Returns its id.
 */
async function writeDataLessDocumentResource(ml: MiddleLayer): Promise<SignedResourceId> {
  return await ml.pl.withWriteTx("TestWriteForeignFoldersDocument", async (tx) => {
    const rid = await ensureFoldersRid(tx);
    const f = field(rid, FoldersDocumentField);
    const ref = tx.createEphemeral({ name: "FoldersSomethingElse", version: "1" });
    tx.lock(ref);
    if (await tx.fieldExists(f)) tx.setField(f, ref);
    else tx.createField(f, "Dynamic", ref);
    await tx.commit();
    return await ref.globalId;
  });
}

/** Resource the single document field currently points at. */
async function documentValueRid(ml: MiddleLayer): Promise<SignedResourceId | undefined> {
  return await ml.pl.withReadTx("TestReadFoldersField", async (tx) => {
    const singleton = await tx.getField(field(tx.clientRoot, FoldersField));
    if (isNullSignedResourceId(singleton.value)) return undefined;
    const fData = await tx.getFieldIfExists(field(singleton.value, FoldersDocumentField));
    if (fData === undefined || isNullSignedResourceId(fData.value)) return undefined;
    return fData.value;
  });
}

/** Document held by one particular value resource, whichever one the field points at now. */
async function documentAt(
  ml: MiddleLayer,
  rid: SignedResourceId,
): Promise<{ folders: { name: string }[] } | undefined> {
  return await ml.pl.withReadTx("TestReadFoldersValue", async (tx) => {
    const data = await tx.getResourceData(rid, false);
    if (data.data === undefined) return undefined;
    return JSON.parse(Buffer.from(data.data).toString("utf-8")) as { folders: { name: string }[] };
  });
}

/** The parsed JSON held by one particular value resource. */
async function rawDocumentAt(ml: MiddleLayer, rid: SignedResourceId): Promise<unknown> {
  return await ml.pl.withReadTx("TestReadRawFoldersValue", async (tx) => {
    const data = await tx.getResourceData(rid, false);
    if (data.data === undefined) return undefined;
    return JSON.parse(Buffer.from(data.data).toString("utf-8")) as unknown;
  });
}

/** Whether the folder singleton itself has been created on the client root. */
async function singletonExists(ml: MiddleLayer): Promise<boolean> {
  return await ml.pl.withReadTx("TestFoldersSingletonExists", async (tx) => {
    const fData = await tx.getFieldIfExists(field(tx.clientRoot, FoldersField));
    return fData !== undefined && !isNullSignedResourceId(fData.value);
  });
}

/** Whether the singleton's one document field has been created at all. */
async function documentFieldExists(ml: MiddleLayer): Promise<boolean> {
  return await ml.pl.withReadTx("TestFoldersDocumentExists", async (tx) => {
    const singleton = await tx.getField(field(tx.clientRoot, FoldersField));
    if (isNullSignedResourceId(singleton.value)) return false;
    const fData = await tx.getFieldIfExists(field(singleton.value, FoldersDocumentField));
    return fData !== undefined;
  });
}
