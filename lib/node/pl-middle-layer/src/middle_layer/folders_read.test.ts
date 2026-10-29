/**
 * The two decisions of the folder read and write that need no backend: what the join publishes
 * for a given folder resource, and when a plan is allowed to become a write.
 *
 * `foldersListing` is the whole computable body and `commitFoldersMove` is the
 * whole move contract, so both are fed here with plain objects instead of a synchronized tree
 * and a transaction.
 */

import { describe, expect, it } from "vitest";
import type {
  FolderId,
  FoldersMovePlan,
  FoldersMovePlanResult,
  FoldersView,
} from "@milaboratories/pl-model-middle-layer";
import {
  FOLDERS_SCHEMA_VERSION,
  commitFoldersMove,
  decodeFoldersDocument,
  encodeFoldersDocument,
  healFolders,
  planFoldersMove,
} from "@milaboratories/pl-model-middle-layer";
import type { ProjectId, ProjectListEntry } from "../model/project_model";
import type { TemplateId, TemplateListEntry } from "./template_list";
import { FoldersDocumentField, foldersListing, foldersLocalSubtree } from "./folders";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Stand-in for the folder singleton's tree node, carrying exactly what the read reads.
 *
 * `raw` is the stored document; `noBlob` is a document field pointing at a resource that carries
 * no blob at all; `fieldPresent` alone is a document field whose value has not arrived.
 */
function foldersNode(document: {
  readonly raw?: string;
  readonly noBlob?: boolean;
  readonly fieldPresent?: boolean;
}) {
  const valuePresent = document.noBlob === true || document.raw !== undefined;
  const fieldPresent = document.fieldPresent ?? valuePresent;
  return {
    listDynamicFields: () => (fieldPresent ? [FoldersDocumentField] : []),
    traverse: (step: { field: string; stableIfNotFound: true }) => {
      if (step.stableIfNotFound !== true)
        throw new Error("a missing document field must be a stable absence, not an unstable one");
      if (step.field !== FoldersDocumentField || !valuePresent) return undefined;
      return { getDataAsString: () => (document.noBlob === true ? undefined : document.raw) };
    },
  };
}

function entry(id: string, label: string, modified = 1): ProjectListEntry {
  return {
    id: id as ProjectId,
    created: new Date(1),
    lastModified: new Date(modified),
    opened: false,
    meta: { label },
  };
}

const Alpha = "folder-alpha" as FolderId;
const Beta = "folder-beta" as FolderId;

function document(
  folders: readonly { id: FolderId; name: string; parent?: FolderId }[],
  assignments: Record<string, FolderId>,
  templateAssignments: Record<string, FolderId> = {},
): string {
  return encodeFoldersDocument({
    schemaVersion: FOLDERS_SCHEMA_VERSION,
    folders,
    assignments,
    templateAssignments,
  });
}

function templateEntry(id: string, label: string): TemplateListEntry {
  return { id: id as TemplateId, label, created: new Date(1), blockCount: 1 };
}

/** A view over the given folders and projects, as the planner sees one. */
function viewOf(
  folders: readonly { id: FolderId; name: string; parent?: FolderId }[],
  projects: readonly { id: string; name: string; folder?: FolderId }[],
): FoldersView {
  const decoded = decodeFoldersDocument(
    document(
      folders,
      Object.fromEntries(
        projects.flatMap((p) => (p.folder === undefined ? [] : [[p.id, p.folder] as const])),
      ),
    ),
  );
  return healFolders(
    decoded,
    projects.map((p) => ({ id: p.id as ProjectId, name: p.name })),
  );
}

function ready(result: ReturnType<typeof foldersListing>) {
  if (result.status !== "ready") throw new Error(`expected a listing, got ${result.status}`);
  return result.listing;
}

// ── The read ─────────────────────────────────────────────────────────────────

describe("foldersListing", () => {
  it("publishes a flat list when the user has no folder document", () => {
    const listing = ready(foldersListing(foldersNode({}), [entry("p1", "A"), entry("p2", "B")]));
    expect(listing.folders).toEqual([]);
    expect(listing.projects.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(listing.projects.every((p) => p.folder === undefined)).toBe(true);
    expect(listing.writable).toBe(true);
    expect(listing.problem).toBeUndefined();
  });

  it("publishes nothing while a document field exists whose value has not arrived", () => {
    const result = foldersListing(foldersNode({ fieldPresent: true }), [entry("p1", "A")]);
    expect(result.status).toBe("not-synced");
  });

  it("degrades instead of stalling when the document resource carries no blob", () => {
    // A node the tree holds carries whatever data it had when its frame was taken and the tree
    // never fills data in afterwards, so this is a document this build cannot read — not a slow
    // sync. Waiting for it would hide the whole project list behind a loading state for ever.
    const listing = ready(
      foldersListing(foldersNode({ noBlob: true }), [entry("p1", "A"), entry("p2", "B")]),
    );
    expect(listing.projects.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(listing.writable).toBe(false);
    expect(listing.problem?.kind).toBe("unreadable");
  });

  it("degrades and refuses writes for a document written by a newer build", () => {
    const listing = ready(
      foldersListing(
        foldersNode({ raw: JSON.stringify({ schemaVersion: 99, folders: [], assignments: {} }) }),
        [entry("p1", "A")],
      ),
    );
    expect(listing.folders).toEqual([]);
    expect(listing.projects.map((p) => p.id)).toEqual(["p1"]);
    expect(listing.writable).toBe(false);
    expect(listing.problem).toMatchObject({ kind: "newer-schema", documentSchemaVersion: 99 });
  });

  it("degrades for a document that is not JSON at all", () => {
    const listing = ready(foldersListing(foldersNode({ raw: "{{{" }), [entry("p1", "A")]));
    expect(listing.projects).toHaveLength(1);
    expect(listing.writable).toBe(false);
    expect(listing.problem?.kind).toBe("unreadable");
  });

  it("places templates in the same tree as projects, by the same path", () => {
    const listing = ready(
      foldersListing(
        foldersNode({
          raw: document(
            [
              { id: Alpha, name: "Samples" },
              { id: Beta, name: "Runs", parent: Alpha },
            ],
            { p1: Alpha },
            { t1: Beta },
          ),
        }),
        [entry("p1", "Report")],
        [templateEntry("t1", "Report"), templateEntry("t2", "Loose")],
      ),
    );

    expect(listing.templates.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(listing.templates.find((t) => t.id === "t1")?.path).toEqual(["Samples", "Runs"]);
    expect(listing.templates.find((t) => t.id === "t1")?.ancestors).toEqual([Alpha, Beta]);
    // A template the document never mentions is at the top level, not missing.
    expect(listing.templates.find((t) => t.id === "t2")?.folder).toBeUndefined();
    // A template and a project may carry one name in one tree; that is not a collision.
    expect(listing.healed).toBe(false);
  });

  it("keeps every template even when the folder document cannot be read", () => {
    const listing = ready(
      foldersListing(foldersNode({ raw: "{{{" }), [], [templateEntry("t1", "A")]),
    );
    expect(listing.templates.map((t) => t.id)).toEqual(["t1"]);
    expect(listing.writable).toBe(false);
  });

  it("gives every project its folder and the path that tells two of a name apart", () => {
    const listing = ready(
      foldersListing(
        foldersNode({
          raw: document(
            [
              { id: Alpha, name: "Samples" },
              { id: Beta, name: "Runs", parent: Alpha },
            ],
            { p2: Beta },
          ),
        }),
        [entry("p1", "Report"), entry("p2", "Report")],
      ),
    );
    expect(listing.projects.find((p) => p.id === "p1")?.path).toEqual([]);
    expect(listing.projects.find((p) => p.id === "p2")?.path).toEqual(["Samples", "Runs"]);
    expect(listing.projects.find((p) => p.id === "p2")?.ancestors).toEqual([Alpha, Beta]);
  });

  it("keeps every project a document mentions nowhere, and every one it names wrongly", () => {
    const listing = ready(
      foldersListing(
        foldersNode({
          raw: document([{ id: Alpha, name: "Samples" }], {
            p1: Beta,
            gone: Alpha,
          }),
        }),
        [entry("p1", "A"), entry("p2", "B")],
      ),
    );
    expect(listing.projects.map((p) => p.id)).toEqual(["p1", "p2"]);
    // p1 is assigned to a folder the document does not hold, so it heals to the top level.
    expect(listing.projects.find((p) => p.id === "p1")?.folder).toBeUndefined();
    expect(listing.healed).toBe(true);
  });

  it("keeps every project when the document is nothing but a cycle", () => {
    const listing = ready(
      foldersListing(
        foldersNode({
          raw: document(
            [
              { id: Alpha, name: "A", parent: Beta },
              { id: Beta, name: "B", parent: Alpha },
            ],
            { p1: Alpha, p2: Beta },
          ),
        }),
        [entry("p1", "One"), entry("p2", "Two")],
      ),
    );
    expect(listing.projects.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(listing.folders.some((f) => f.parent === undefined)).toBe(true);
    expect(listing.healed).toBe(true);
  });
});

// ── The move contract ────────────────────────────────────────────────────────

describe("commitFoldersMove", () => {
  const view = viewOf(
    [
      { id: Alpha, name: "Samples" },
      { id: Beta, name: "Runs" },
    ],
    [
      { id: "p1", name: "Report" },
      { id: "p2", name: "Report", folder: Alpha },
    ],
  );

  function planMove(destination?: FolderId): FoldersMovePlanResult {
    return planFoldersMove(view, [{ kind: "project", id: "p1" as ProjectId }], destination);
  }

  it("writes nothing and reports the fresh plan when the confirmed one disagrees", () => {
    const stale: FoldersMovePlan = { destination: Alpha, entries: [] };
    const edit = commitFoldersMove(view, planMove(Alpha), stale);
    expect(edit.document).toBeUndefined();
    expect(edit.result).toMatchObject({ ok: false, reason: "plan-changed" });
  });

  it("commits when the confirmed plan is the one recomputed here", () => {
    const planned = planMove(Alpha);
    if (!planned.ok) throw new Error("expected a plan");
    const edit = commitFoldersMove(view, planned, planned.plan);
    expect(edit.document).toBeDefined();
    expect(edit.result).toMatchObject({ ok: true });
    // The destination already holds a "Report", so the moved one is the renamed one.
    expect(edit.labelRenames).toEqual([
      { item: { kind: "project", id: "p1" }, name: "Report (Copy)" },
    ]);
  });

  it("refuses a plan it cannot compute at all", () => {
    const edit = commitFoldersMove(
      view,
      planFoldersMove(view, [{ kind: "folder", id: "nope" as FolderId }]),
      undefined,
    );
    expect(edit.document).toBeUndefined();
    expect(edit.result).toMatchObject({ ok: false, reason: "cannot-plan" });
  });

  it("writes nothing for a move of nothing", () => {
    const planned = planFoldersMove(view, [], Alpha);
    if (!planned.ok) throw new Error("expected a plan");
    const edit = commitFoldersMove(view, planned, planned.plan);
    expect(edit.document).toBeUndefined();
    expect(edit.result).toMatchObject({ ok: true });
  });
});

// ── The shape a copy carries ─────────────────────────────────────────────────

describe("foldersLocalSubtree", () => {
  const Gamma = "folder-gamma" as FolderId;
  const Delta = "folder-delta" as FolderId;

  // Alpha ⊃ Beta ⊃ Gamma, with Delta beside Alpha.
  const nested = viewOf(
    [
      { id: Alpha, name: "Alpha" },
      { id: Beta, name: "Beta", parent: Alpha },
      { id: Gamma, name: "Gamma", parent: Beta },
      { id: Delta, name: "Delta" },
    ],
    [],
  );

  let next = 0;
  const mint = () => `local-${next++}`;

  it("carries the whole subtree and nothing beside it", () => {
    next = 0;
    const { inSubtree, folders } = foldersLocalSubtree(nested, Alpha, mint);
    expect([...inSubtree].sort()).toEqual([Alpha, Beta, Gamma].sort());
    expect(
      Object.values(folders)
        .map((f) => f.name)
        .sort(),
    ).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("leaves the root's own parent behind, and keeps every other one inside", () => {
    next = 0;
    const { localId, folders } = foldersLocalSubtree(nested, Beta, mint);
    expect(folders[localId(Beta)].parent).toBeUndefined();
    expect(folders[localId(Gamma)].parent).toBe(localId(Beta));
  });

  it("names every folder anew, so nothing of the source's ids travels", () => {
    next = 0;
    const { localId } = foldersLocalSubtree(nested, Alpha, mint);
    const local = [Alpha, Beta, Gamma].map(localId);
    expect(new Set(local).size).toBe(3);
    expect(local).not.toContain(Alpha);
  });

  it("refuses to name a folder outside the subtree", () => {
    next = 0;
    const { localId } = foldersLocalSubtree(nested, Beta, mint);
    expect(() => localId(Delta)).toThrow(/not under/);
  });
});
