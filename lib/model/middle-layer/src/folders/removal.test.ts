import { describe, expect, test } from "vitest";
import { commitFoldersRemoval } from "./commit";
import { applyFoldersRemoval, foldersRemovalsEqual, planFoldersRemoval } from "./removal";
import { fid, pid, tid, view } from "./test_utils";
import type { FoldersView } from "./view";

/**
 * Parent / Doomed / Deeper, with a project and a template at every level and one of each at the
 * top, so every test can say both what a deletion takes and what it must leave standing.
 */
function tree(): FoldersView {
  return view(
    [
      { id: "p", name: "Parent" },
      { id: "d", name: "Doomed", parent: "p" },
      { id: "deep", name: "Deeper", parent: "d" },
    ],
    [
      { id: "inDoomed", name: "In doomed", folder: "d" },
      { id: "inDeep", name: "In deep", folder: "deep" },
      { id: "inParent", name: "In parent", folder: "p" },
      { id: "atTop", name: "At top" },
    ],
    [
      { id: "tplInDoomed", name: "Template in doomed", folder: "d" },
      { id: "tplInParent", name: "Template in parent", folder: "p" },
      { id: "tplAtTop", name: "Template at top" },
    ],
  );
}

function removalOf(state: FoldersView, folder: string) {
  const planned = planFoldersRemoval(state, fid(folder));
  if (!planned.ok) throw new Error("expected a removal");
  return planned.removal;
}

describe("planning a folder removal", () => {
  test("takes the folder, every folder beneath it, and every project and template inside", () => {
    const removal = removalOf(tree(), "d");

    expect([...removal.folders].sort()).toEqual([fid("d"), fid("deep")]);
    expect([...removal.projects].sort()).toEqual([pid("inDeep"), pid("inDoomed")]);
    expect([...removal.templates].sort()).toEqual([tid("tplInDoomed")]);
  });

  test("leaves everything outside the subtree alone", () => {
    const document = applyFoldersRemoval(tree(), removalOf(tree(), "d"));

    expect(document.folders.map((folder) => folder.id)).toEqual([fid("p")]);
    expect(document.assignments).toEqual({ inParent: fid("p") });
    expect(document.templateAssignments).toEqual({ tplInParent: fid("p") });
  });

  test("a folder that is not there is refused", () => {
    const planned = planFoldersRemoval(tree(), fid("ghost"));

    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.issues).toEqual([{ kind: "unknown-folder", folder: fid("ghost") }]);
  });

  test("an empty folder removes itself and nothing else", () => {
    const empty = view([{ id: "e", name: "Empty" }], [{ id: "atTop", name: "At top" }]);
    const removal = removalOf(empty, "e");

    expect(removal.folders).toEqual([fid("e")]);
    expect(removal.projects).toEqual([]);
    expect(removal.templates).toEqual([]);
  });

  test("the order is canonical, so two reads of one tree compare equal", () => {
    expect(foldersRemovalsEqual(removalOf(tree(), "d"), removalOf(tree(), "d"))).toBe(true);
  });
});

describe("committing a folder removal", () => {
  test("nothing is written without a confirmed removal", () => {
    const view = tree();
    const edit = commitFoldersRemoval(view, planFoldersRemoval(view, fid("d")), undefined);

    expect(edit.document).toBeUndefined();
    expect(edit.deletedProjects).toBeUndefined();
    expect(edit.result.ok).toBe(false);
    if (edit.result.ok) return;
    expect(edit.result.reason).toBe("needs-confirmation");
  });

  test("a project that appeared since the dialog opened aborts the deletion", () => {
    const confirmed = removalOf(tree(), "d");

    // The same folder, with one more project dropped into it in the meantime.
    const after = view(
      [
        { id: "p", name: "Parent" },
        { id: "d", name: "Doomed", parent: "p" },
        { id: "deep", name: "Deeper", parent: "d" },
      ],
      [
        { id: "inDoomed", name: "In doomed", folder: "d" },
        { id: "inDeep", name: "In deep", folder: "deep" },
        { id: "latecomer", name: "Latecomer", folder: "d" },
      ],
      [{ id: "tplInDoomed", name: "Template in doomed", folder: "d" }],
    );

    const edit = commitFoldersRemoval(after, planFoldersRemoval(after, fid("d")), confirmed);

    expect(edit.document).toBeUndefined();
    expect(edit.result.ok).toBe(false);
    if (edit.result.ok || edit.result.reason === "cannot-plan")
      throw new Error("expected the removal to be refused as changed");
    expect(edit.result.reason).toBe("plan-changed");
    // The fresh removal is handed back, and it names the project the dialog never showed.
    expect(edit.result.removal.projects).toContain(pid("latecomer"));
  });

  test("a confirmed removal writes the document and names the projects to destroy", () => {
    const view = tree();
    const confirmed = removalOf(view, "d");
    const edit = commitFoldersRemoval(view, planFoldersRemoval(view, fid("d")), confirmed);

    expect(edit.result.ok).toBe(true);
    expect(edit.document?.folders.map((folder) => folder.id)).toEqual([fid("p")]);
    expect([...(edit.deletedProjects ?? [])].sort()).toEqual([pid("inDeep"), pid("inDoomed")]);
    expect([...(edit.deletedTemplates ?? [])].sort()).toEqual([tid("tplInDoomed")]);
  });

  test("a folder that vanished before the write is refused, not guessed at", () => {
    const view = tree();
    const edit = commitFoldersRemoval(view, planFoldersRemoval(view, fid("ghost")), {
      folders: [],
      projects: [],
      templates: [],
    });

    expect(edit.document).toBeUndefined();
    expect(edit.result.ok).toBe(false);
    if (edit.result.ok) return;
    expect(edit.result.reason).toBe("cannot-plan");
  });
});
