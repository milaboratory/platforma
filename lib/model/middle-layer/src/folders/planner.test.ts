import { describe, expect, test } from "vitest";
import type { FoldersMovePlanResult } from "./planner";
import { applyFoldersMove, planFoldersMove, foldersMovePlansEqual } from "./planner";
import { fid, folder, pid, project, template, view } from "./test_utils";
import { foldersViewFromDocument } from "./view";

function planned(result: FoldersMovePlanResult) {
  if (!result.ok) throw new Error(`expected a plan, got ${JSON.stringify(result.issues)}`);
  return result.plan;
}

function issues(result: FoldersMovePlanResult) {
  if (result.ok) throw new Error("expected the plan to be refused");
  return result.issues;
}

describe("planFoldersMove", () => {
  test("a move into free names renames nothing", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      [{ id: "p1", name: "Run", folder: "a" }],
    );

    const plan = planned(planFoldersMove(tree, [project("p1")], fid("b")));
    expect(plan.destination).toBe("b");
    expect(plan.entries).toEqual([
      {
        item: { kind: "project", id: "p1" },
        currentName: "Run",
        name: "Run",
        renamed: false,
        sourceFolder: "a",
      },
    ]);
  });

  test("a name the destination already holds is suffixed", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      [
        { id: "p1", name: "Run", folder: "a" },
        { id: "p2", name: "Run", folder: "b" },
      ],
    );

    const plan = planned(planFoldersMove(tree, [project("p1")], fid("b")));
    expect(plan.entries[0]).toMatchObject({ name: "Run (Copy)", renamed: true });
  });

  test("folders and projects share one namespace inside a parent", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "Run", parent: "a" },
      ],
      [{ id: "p1", name: "Run" }],
    );

    const plan = planned(planFoldersMove(tree, [project("p1")], fid("a")));
    expect(plan.entries[0]).toMatchObject({ name: "Run (Copy)", renamed: true });
  });

  test("several moved items with the same name are given distinct ones", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ],
      [
        { id: "p1", name: "Run", folder: "a" },
        { id: "p2", name: "Run", folder: "b" },
      ],
    );

    const plan = planned(planFoldersMove(tree, [project("p1"), project("p2")], fid("c")));
    expect(plan.entries.map((entry) => entry.name)).toEqual(["Run", "Run (Copy)"]);
  });

  test("an item already in the destination keeps its own name", () => {
    const tree = view([{ id: "a", name: "A" }], [{ id: "p1", name: "Run", folder: "a" }]);
    const plan = planned(planFoldersMove(tree, [project("p1")], fid("a")));
    expect(plan.entries[0]).toMatchObject({ name: "Run", renamed: false });
  });

  test("the order the caller lists items in does not change the plan", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "dest", name: "Dest" },
      ],
      [
        { id: "p1", name: "Run", folder: "a" },
        { id: "p2", name: "Run", folder: "a" },
      ],
    );

    const first = planned(
      planFoldersMove(tree, [folder("a"), project("p1"), project("p2")], fid("dest")),
    );
    const second = planned(
      planFoldersMove(tree, [project("p2"), project("p1"), folder("a")], fid("dest")),
    );
    expect(foldersMovePlansEqual(first, second)).toBe(true);
  });

  test("a move to the top level is planned against the top level's names", () => {
    const tree = view(
      [{ id: "a", name: "A" }],
      [
        { id: "p1", name: "Run" },
        { id: "p2", name: "Run", folder: "a" },
      ],
    );

    const plan = planned(planFoldersMove(tree, [project("p2")]));
    expect(plan.destination).toBeUndefined();
    expect(plan.entries[0]).toMatchObject({ name: "Run (Copy)", renamed: true });
  });

  test("a move of nothing plans nothing", () => {
    const tree = view([{ id: "f", name: "F" }], [{ id: "p", name: "P" }]);
    expect(planned(planFoldersMove(tree, [], fid("f"))).entries).toEqual([]);
  });

  test("the same item named twice in one selection is planned once", () => {
    const tree = view([{ id: "d", name: "D" }], [{ id: "p", name: "P" }]);
    expect(
      planned(planFoldersMove(tree, [project("p"), project("p")], fid("d"))).entries,
    ).toHaveLength(1);
  });

  test("an unknown destination is refused", () => {
    const tree = view([], [{ id: "p1", name: "Run" }]);
    expect(issues(planFoldersMove(tree, [project("p1")], fid("nope")))).toEqual([
      { kind: "unknown-destination", folder: "nope" },
    ]);
  });

  test("an unknown item is refused", () => {
    const tree = view([{ id: "a", name: "A" }], []);
    expect(issues(planFoldersMove(tree, [project("ghost")], fid("a")))).toEqual([
      { kind: "unknown-item", item: { kind: "project", id: "ghost" } },
    ]);
  });

  test("a folder cannot be moved into itself or into its own descendant", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B", parent: "a" },
      ],
      [],
    );

    expect(issues(planFoldersMove(tree, [folder("a")], fid("a")))[0]?.kind).toBe(
      "into-own-descendant",
    );
    expect(issues(planFoldersMove(tree, [folder("a")], fid("b")))[0]?.kind).toBe(
      "into-own-descendant",
    );
  });

  test("a move that nests deeply is allowed: there is no depth limit", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B", parent: "a" },
        { id: "x", name: "X" },
        { id: "y", name: "Y", parent: "x" },
      ],
      [],
    );

    expect(planFoldersMove(tree, [folder("x")], fid("b")).ok).toBe(true);
    expect(planFoldersMove(tree, [folder("x")], fid("a")).ok).toBe(true);
    // The one nesting rule that remains: a folder may not be moved inside itself.
    expect(issues(planFoldersMove(tree, [folder("x")], fid("y")))).toEqual([
      { kind: "into-own-descendant", folder: "x", destination: "y" },
    ]);
  });

  test("a project may be moved into a nested folder", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B", parent: "a" },
        { id: "c", name: "C", parent: "b" },
      ],
      [{ id: "p1", name: "Run" }],
    );
    expect(planFoldersMove(tree, [project("p1")], fid("c")).ok).toBe(true);
  });
});

describe("a selection holding a folder and something inside it", () => {
  const tree = view(
    [
      { id: "a", name: "A" },
      { id: "b", name: "B", parent: "a" },
      { id: "c", name: "C", parent: "b" },
      { id: "dest", name: "Dest" },
    ],
    [
      { id: "p1", name: "Run", folder: "a" },
      { id: "p2", name: "Deep run", folder: "c" },
      { id: "p3", name: "Elsewhere" },
    ],
    [{ id: "t1", name: "Snapshot", folder: "b" }],
  );

  test("moves the folder alone, carrying its contents along", () => {
    const plan = planned(
      planFoldersMove(tree, [folder("a"), folder("b"), project("p1")], fid("dest")),
    );
    expect(plan.entries.map((entry) => entry.item)).toEqual([folder("a")]);
  });

  test("keeps the moved subtree intact", () => {
    const selection = [folder("a"), folder("b"), folder("c"), project("p1"), project("p2")];
    const plan = planned(planFoldersMove(tree, [...selection, template("t1")], fid("dest")));
    const moved = foldersViewFromDocument(
      applyFoldersMove(tree, plan).document,
      tree.projects,
      tree.templates,
    );

    expect(moved.folders.find((entry) => entry.id === "a")?.parent).toBe("dest");
    expect(moved.folders.find((entry) => entry.id === "b")?.parent).toBe("a");
    expect(moved.folders.find((entry) => entry.id === "c")?.path).toEqual(["Dest", "A", "B", "C"]);
    expect(moved.projects.find((entry) => entry.id === "p1")?.folder).toBe("a");
    expect(moved.projects.find((entry) => entry.id === "p2")?.folder).toBe("c");
    expect(moved.templates.find((entry) => entry.id === "t1")?.folder).toBe("b");
  });

  test("still moves what the folder does not hold", () => {
    const plan = planned(
      planFoldersMove(tree, [project("p1"), folder("b"), project("p3")], fid("dest")),
    );
    expect(plan.entries.map((entry) => entry.item)).toEqual([
      folder("b"),
      project("p3"),
      project("p1"),
    ]);
  });

  test("is refused when the destination lies inside the folder", () => {
    expect(issues(planFoldersMove(tree, [folder("a"), folder("b")], fid("c")))).toEqual([
      { kind: "into-own-descendant", folder: "a", destination: "c" },
    ]);
  });
});

describe("moving a template", () => {
  test("a template arriving where a project carries its name is renamed", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      [{ id: "p1", name: "Run", folder: "b" }],
      [{ id: "t1", name: "Run", folder: "a" }],
    );

    const plan = planned(planFoldersMove(tree, [template("t1")], fid("b")));
    expect(plan.entries[0]).toMatchObject({
      name: "Run (Copy)",
      renamed: true,
      sourceFolder: "a",
    });
  });

  test("a template arriving where another template carries its name is renamed", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      [],
      [
        { id: "t1", name: "Snapshot", folder: "a" },
        { id: "t2", name: "Snapshot", folder: "b" },
      ],
    );

    const plan = planned(planFoldersMove(tree, [template("t1")], fid("b")));
    expect(plan.entries[0]).toMatchObject({ name: "Snapshot (Copy)", renamed: true });
    expect(applyFoldersMove(tree, plan).labelRenames).toEqual([
      { item: { kind: "template", id: "t1" }, name: "Snapshot (Copy)" },
    ]);
  });

  test("a project arriving where a template carries its name is renamed", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      [{ id: "p1", name: "Run", folder: "a" }],
      [{ id: "t1", name: "Run", folder: "b" }],
    );

    const plan = planned(planFoldersMove(tree, [project("p1")], fid("b")));
    expect(plan.entries[0]).toMatchObject({ name: "Run (Copy)", renamed: true });
  });

  test("applying the plan re-parents the template and touches nothing else", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      [{ id: "p1", name: "Run", folder: "a" }],
      [{ id: "t1", name: "Snapshot", folder: "a" }],
    );

    const plan = planned(planFoldersMove(tree, [template("t1")], fid("b")));
    const applied = applyFoldersMove(tree, plan);

    expect(applied.document.templateAssignments).toEqual({ t1: "b" });
    expect(applied.document.assignments).toEqual({ p1: "a" });
    expect(applied.labelRenames).toEqual([]);
  });

  test("folders come first, then projects, then templates, whatever order is handed in", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "dest", name: "Dest" },
      ],
      [{ id: "p1", name: "Run" }],
      [{ id: "t1", name: "Snapshot" }],
    );

    const plan = planned(
      planFoldersMove(tree, [template("t1"), project("p1"), folder("a")], fid("dest")),
    );
    expect(plan.entries.map((entry) => entry.item.kind)).toEqual(["folder", "project", "template"]);
  });

  test("a template that is not there is refused", () => {
    const tree = view([{ id: "a", name: "A" }], []);
    expect(issues(planFoldersMove(tree, [template("ghost")], fid("a")))).toEqual([
      { kind: "unknown-item", item: { kind: "template", id: "ghost" } },
    ]);
  });
});

describe("foldersMovePlansEqual", () => {
  const tree = view(
    [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    [{ id: "p1", name: "Run", folder: "a" }],
  );

  test("a plan equals itself recomputed over unchanged state", () => {
    const first = planned(planFoldersMove(tree, [project("p1")], fid("b")));
    const second = planned(planFoldersMove(tree, [project("p1")], fid("b")));
    expect(foldersMovePlansEqual(first, second)).toBe(true);
  });

  test("a plan stops matching once the destination has gained a colliding name", () => {
    const confirmed = planned(planFoldersMove(tree, [project("p1")], fid("b")));

    const moved = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      [
        { id: "p1", name: "Run", folder: "a" },
        { id: "p2", name: "Run", folder: "b" },
      ],
    );
    const fresh = planned(planFoldersMove(moved, [project("p1")], fid("b")));

    expect(foldersMovePlansEqual(confirmed, fresh)).toBe(false);
    expect(fresh.entries[0]).toMatchObject({ name: "Run (Copy)" });
  });

  test("plans into different destinations are not equal", () => {
    const toB = planned(planFoldersMove(tree, [project("p1")], fid("b")));
    const toRoot = planned(planFoldersMove(tree, [project("p1")]));
    expect(foldersMovePlansEqual(toB, toRoot)).toBe(false);
  });
});

describe("applyFoldersMove", () => {
  test("a move re-parents the items and names the renames it implies", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      [
        { id: "p1", name: "Run", folder: "a" },
        { id: "p2", name: "Run", folder: "b" },
      ],
    );

    const plan = planned(planFoldersMove(tree, [project("p1")], fid("b")));
    const applied = applyFoldersMove(tree, plan);

    expect(applied.document.assignments).toEqual({ p1: "b", p2: "b" });
    expect(applied.labelRenames).toEqual([
      { item: { kind: "project", id: "p1" }, name: "Run (Copy)" },
    ]);
  });

  test("a moved folder keeps its own subtree", () => {
    const tree = view(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B", parent: "a" },
        { id: "dest", name: "Dest" },
      ],
      [{ id: "p1", name: "Run", folder: "b" }],
    );

    const plan = planned(planFoldersMove(tree, [folder("a")], fid("dest")));
    const applied = applyFoldersMove(tree, plan);

    const moved = foldersViewFromDocument(applied.document, [{ id: pid("p1"), name: "Run" }]);
    expect(moved.folders.find((entry) => entry.id === "a")?.parent).toBe("dest");
    expect(moved.folders.find((entry) => entry.id === "b")?.path).toEqual(["Dest", "A", "B"]);
    expect(moved.projects[0]?.folder).toBe("b");
  });
});
