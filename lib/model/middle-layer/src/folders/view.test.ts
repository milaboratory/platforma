import { describe, expect, test } from "vitest";
import type { FoldersDocument } from "./document";
import { validateFoldersDocument } from "./invariants";
import { document, fid, pid, tid } from "./test_utils";
import type { FoldersProjectInput, FoldersView } from "./view";
import {
  healFolders,
  foldersChildren,
  foldersDocumentFromView,
  foldersSiblingNames,
  foldersViewFromDocument,
} from "./view";

function projects(...names: string[]): FoldersProjectInput[] {
  return names.map((name) => ({ id: pid(name), name }));
}

const folderOf = (view: FoldersView, id: string) => {
  const found = view.folders.find((folder) => folder.id === id);
  if (found === undefined) throw new Error(`folder ${id} is not in the view`);
  return found;
};

const projectOf = (view: FoldersView, id: string) => {
  const found = view.projects.find((project) => project.id === id);
  if (found === undefined) throw new Error(`project ${id} is not in the view`);
  return found;
};

describe("the healing read resolves the tree", () => {
  test("ancestors and path are resolved for every folder", () => {
    const view = foldersViewFromDocument(
      document([
        { id: "a", name: "A" },
        { id: "b", name: "B", parent: "a" },
        { id: "c", name: "C", parent: "b" },
      ]),
      [],
    );

    expect(folderOf(view, "a")).toMatchObject({ ancestors: [], path: ["A"] });
    expect(folderOf(view, "b")).toMatchObject({ ancestors: ["a"], path: ["A", "B"] });
    expect(folderOf(view, "c")).toMatchObject({
      ancestors: ["a", "b"],
      path: ["A", "B", "C"],
    });
    expect(view.healed).toBe(false);
  });

  test("a project carries its folder and the path that tells two of the same name apart", () => {
    const view = foldersViewFromDocument(
      document(
        [
          { id: "a", name: "A" },
          { id: "b", name: "B", parent: "a" },
        ],
        { one: "b" },
      ),
      [
        { id: pid("one"), name: "Run" },
        { id: pid("two"), name: "Run" },
      ],
    );

    expect(projectOf(view, "one")).toMatchObject({
      folder: "b",
      ancestors: ["a", "b"],
      path: ["A", "B"],
    });
    expect(projectOf(view, "two").folder).toBeUndefined();
    expect(projectOf(view, "two").path).toEqual([]);
  });
});

describe("the healing read heals rather than fails", () => {
  test("a project the document does not mention is at the top level", () => {
    const view = foldersViewFromDocument(document([{ id: "a", name: "A" }]), projects("p1"));
    expect(projectOf(view, "p1").folder).toBeUndefined();
    expect(view.healed).toBe(false);
  });

  test("an assignment naming a project that is gone is ignored", () => {
    const view = foldersViewFromDocument(
      document([{ id: "a", name: "A" }], { gone: "a" }),
      projects("p1"),
    );
    expect(view.projects.map((project) => project.id)).toEqual(["p1"]);
    expect(view.healed).toBe(true);
  });

  test("an assignment naming a folder that is gone puts the project at the top level", () => {
    const view = foldersViewFromDocument(document([], { p1: "gone" }), projects("p1"));
    expect(projectOf(view, "p1").folder).toBeUndefined();
    expect(view.healed).toBe(true);
  });

  test("a folder whose parent is missing is lifted, keeping its own children", () => {
    const view = foldersViewFromDocument(
      document(
        [
          { id: "b", name: "B", parent: "gone" },
          { id: "c", name: "C", parent: "b" },
        ],
        { p1: "c" },
      ),
      projects("p1"),
    );

    expect(folderOf(view, "b")).toMatchObject({ ancestors: [], lifted: true });
    expect(folderOf(view, "b").parent).toBeUndefined();
    expect(folderOf(view, "c")).toMatchObject({ ancestors: ["b"], parent: "b", lifted: false });
    expect(projectOf(view, "p1").folder).toBe("c");
    expect(view.healed).toBe(true);
  });

  test("a folder in a cycle is lifted and nothing beneath it is hidden", () => {
    const view = foldersViewFromDocument(
      document(
        [
          { id: "a", name: "A", parent: "b" },
          { id: "b", name: "B", parent: "a" },
        ],
        { p1: "a", p2: "b" },
      ),
      projects("p1", "p2"),
    );

    expect(view.folders).toHaveLength(2);
    expect(view.folders.some((folder) => folder.parent === undefined)).toBe(true);
    expect(view.folders.every((folder) => folder.ancestors.length <= 1)).toBe(true);
    expect(projectOf(view, "p1").folder).toBe("a");
    expect(projectOf(view, "p2").folder).toBe("b");
    expect(view.healed).toBe(true);
  });

  test("a deep chain is kept as stored: nesting has no limit", () => {
    const view = foldersViewFromDocument(
      document(
        [
          { id: "a", name: "A" },
          { id: "b", name: "B", parent: "a" },
          { id: "c", name: "C", parent: "b" },
          { id: "d", name: "D", parent: "c" },
          { id: "e", name: "E", parent: "d" },
        ],
        { p1: "e" },
        { t1: "e" },
      ),
      projects("p1"),
      [{ id: tid("t1"), name: "T1" }],
    );

    expect(folderOf(view, "d")).toMatchObject({
      ancestors: ["a", "b", "c"],
      parent: "c",
      lifted: false,
    });
    expect(folderOf(view, "e")).toMatchObject({
      ancestors: ["a", "b", "c", "d"],
      parent: "d",
      lifted: false,
    });
    expect(folderOf(view, "e").path).toEqual(["A", "B", "C", "D", "E"]);
    expect(projectOf(view, "p1").folder).toBe("e");
    expect(view.templates[0]?.folder).toBe("e");
    expect(view.healed).toBe(false);
    // What the read produces is something the write path would accept.
    expect(validateFoldersDocument(foldersDocumentFromView(view))).toEqual([]);
  });

  test("a folder id used twice keeps the first entry", () => {
    const view = foldersViewFromDocument(
      document([
        { id: "a", name: "First" },
        { id: "a", name: "Second" },
      ]),
      [],
    );
    expect(view.folders).toHaveLength(1);
    expect(folderOf(view, "a").name).toBe("First");
    expect(view.healed).toBe(true);
  });

  test("an empty document is readable, unhealed and puts everything at the top level", () => {
    const view = foldersViewFromDocument(document([]), [{ id: pid("p"), name: "P" }]);
    expect(view.healed).toBe(false);
    expect(view.folders).toEqual([]);
    expect(view.projects).toEqual([{ id: pid("p"), name: "P", ancestors: [], path: [] }]);
    expect(view.templates).toEqual([]);
  });

  test("a document naming only items that no longer exist heals to a clean one", () => {
    const view = foldersViewFromDocument(
      document([{ id: "f", name: "F" }], { ghost1: "f", ghost2: "f" }, { ghostTemplate: "f" }),
      [],
    );

    expect(view.projects).toEqual([]);
    expect(view.folders.map((folder) => folder.id)).toEqual([fid("f")]);
    expect(view.healed).toBe(true);
    // The folder survives the departure of everything that was in it; only the dead assignments go.
    expect(foldersDocumentFromView(view).assignments).toEqual({});
    expect(foldersDocumentFromView(view).templateAssignments).toEqual({});
  });

  test("the same project handed in twice appears once", () => {
    const view = foldersViewFromDocument(document([]), [
      { id: pid("p1"), name: "One" },
      { id: pid("p1"), name: "One" },
    ]);
    expect(view.projects).toHaveLength(1);
  });
});

describe("no input can make a project disappear", () => {
  const adversarial: FoldersDocument[] = [
    document([]),
    document([{ id: "a", name: "A", parent: "a" }], { p1: "a", p2: "a", p3: "a" }),
    document(
      [
        { id: "a", name: "A", parent: "b" },
        { id: "b", name: "B", parent: "a" },
      ],
      { p1: "a", p2: "b", p3: "missing" },
    ),
    document(
      [
        { id: "a", name: "A" },
        { id: "a", name: "A again" },
        { id: "b", name: "B", parent: "a" },
        { id: "c", name: "C", parent: "b" },
        { id: "d", name: "D", parent: "c" },
        { id: "e", name: "E", parent: "d" },
      ],
      { p1: "e", p2: "d", p3: "a" },
    ),
    document([{ id: "a", name: "A", parent: "gone" }], { p1: "a", gone: "a", p2: "nowhere" }),
  ];

  test.each(adversarial.map((value, index) => [index, value]))(
    "document %i keeps every project",
    (_index, value) => {
      const handedIn = projects("p1", "p2", "p3");
      const view = foldersViewFromDocument(value as FoldersDocument, handedIn);

      expect(view.projects.map((project) => project.id)).toEqual(["p1", "p2", "p3"]);
      for (const project of view.projects) {
        if (project.folder === undefined) continue;
        expect(view.folders.some((folder) => folder.id === project.folder)).toBe(true);
      }
      // Nesting is uncapped, so what has to hold is that every folder came out placed: an
      // ancestor chain that ends at its parent, and a parent the view actually holds.
      for (const folder of view.folders) {
        expect(folder.ancestors.at(-1)).toBe(folder.parent);
        if (folder.parent === undefined) continue;
        expect(view.folders.some((candidate) => candidate.id === folder.parent)).toBe(true);
      }
    },
  );

  test("a document that is nothing but pathologies still shows every project and template", () => {
    const pathological = document(
      [
        // a two-folder cycle
        { id: "c1", name: "C1", parent: "c2" },
        { id: "c2", name: "C2", parent: "c1" },
        // a parent that is not in the document
        { id: "orphan", name: "Orphan", parent: "gone" },
        // the same id twice
        { id: "dup", name: "Dup" },
        { id: "dup", name: "Dup again" },
      ],
      { p1: "c1", p2: "orphan", p3: "gone", p4: "dup" },
      { t1: "c2", t2: "gone" },
    );
    const handedIn = projects("p1", "p2", "p3", "p4", "p5");
    const templates = ["t1", "t2", "t3"].map((id) => ({ id: tid(id), name: id.toUpperCase() }));

    const view = foldersViewFromDocument(pathological, handedIn, templates);

    expect(view.projects.map((project) => project.id)).toEqual(handedIn.map((p) => p.id));
    expect(view.templates.map((template) => template.id)).toEqual(templates.map((t) => t.id));
    expect(view.healed).toBe(true);
    // Every folder that survives is reachable from the top level, so nothing is rendered nowhere.
    for (const folder of view.folders) {
      expect(folder.ancestors.at(-1)).toBe(folder.parent);
      const outermost = folder.ancestors[0];
      if (outermost === undefined) continue;
      expect(view.folders.find((candidate) => candidate.id === outermost)?.parent).toBeUndefined();
    }
    // A project whose folder is gone, or that the document never mentions, is at the top level.
    expect(projectOf(view, "p3").folder).toBeUndefined();
    expect(projectOf(view, "p5").folder).toBeUndefined();
    // So is a template whose folder is gone.
    expect(view.templates.find((template) => template.id === tid("t2"))?.folder).toBeUndefined();
  });
});

describe("view helpers", () => {
  const view = foldersViewFromDocument(
    document(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B", parent: "a" },
        { id: "c", name: "C", parent: "b" },
      ],
      { p1: "a" },
    ),
    projects("p1", "p2"),
  );

  test("children are the direct contents of one parent", () => {
    expect(foldersChildren(view).folders.map((folder) => folder.id)).toEqual(["a"]);
    expect(foldersChildren(view).projects.map((project) => project.id)).toEqual(["p2"]);
    expect(foldersChildren(view, fid("a")).projects.map((project) => project.id)).toEqual(["p1"]);
  });

  test("sibling names span folders and projects alike", () => {
    expect(foldersSiblingNames(view).sort()).toEqual(["A", "p2"]);
    expect(foldersSiblingNames(view, fid("a")).sort()).toEqual(["B", "p1"]);
  });

  test("sibling names span templates too, and leave out the ids they are told to", () => {
    const withTemplates = foldersViewFromDocument(
      document([{ id: "a", name: "A" }], { p1: "a" }, { t1: "a" }),
      projects("p1"),
      [{ id: tid("t1"), name: "Snapshot" }],
    );

    expect(foldersSiblingNames(withTemplates, fid("a")).sort()).toEqual(["Snapshot", "p1"]);
    expect(foldersSiblingNames(withTemplates, fid("a"), ["t1"])).toEqual(["p1"]);
  });

  test("the view turns back into the document it stands for", () => {
    expect(foldersDocumentFromView(view)).toEqual(
      document(
        [
          { id: "a", name: "A" },
          { id: "b", name: "B", parent: "a" },
          { id: "c", name: "C", parent: "b" },
        ],
        { p1: "a" },
      ),
    );
  });

  test("the document a healed view stands for is itself clean", () => {
    const healed = foldersViewFromDocument(
      document([{ id: "a", name: "A", parent: "gone" }], { p1: "a", ghost: "a" }),
      projects("p1"),
    );
    expect(foldersDocumentFromView(healed)).toEqual(
      document([{ id: "a", name: "A" }], { p1: "a" }),
    );
  });
});

describe("healFolders", () => {
  test("carries the decoder's refusal into the view", () => {
    const view = healFolders(
      {
        document: document([]),
        writable: false,
        problem: { kind: "newer-schema", documentSchemaVersion: 99, message: "newer" },
      },
      projects("p1"),
    );

    expect(view.writable).toBe(false);
    expect(view.problem?.kind).toBe("newer-schema");
    expect(view.projects.map((project) => project.id)).toEqual(["p1"]);
  });
});

describe("folder descriptions", () => {
  test("a description survives a read and the write that follows it", () => {
    const stored = document([
      { id: "a", name: "Alpha", description: "runs of 2026" },
      { id: "b", name: "Beta", parent: "a" },
    ]);

    const view = foldersViewFromDocument(stored, projects());

    expect(view.folders.find((folder) => folder.id === fid("a"))?.description).toBe("runs of 2026");
    expect(view.folders.find((folder) => folder.id === fid("b"))?.description).toBeUndefined();
    expect(foldersDocumentFromView(view)).toStrictEqual(stored);
  });

  test("a folder lifted out of a broken parent keeps what it says about itself", () => {
    const view = foldersViewFromDocument(
      document([{ id: "a", name: "Alpha", parent: "gone", description: "still mine" }]),
      projects(),
    );

    const lifted = view.folders.find((folder) => folder.id === fid("a"));
    expect(lifted?.lifted).toBe(true);
    expect(lifted?.description).toBe("still mine");
  });

  test("an empty or blank description is not stored", () => {
    for (const description of ["", "   "]) {
      const view = foldersViewFromDocument(
        document([{ id: "a", name: "Alpha", description }]),
        projects(),
      );

      expect(foldersDocumentFromView(view).folders[0]).toStrictEqual({
        id: fid("a"),
        name: "Alpha",
      });
    }
  });

  test("a description is stored trimmed", () => {
    const view = foldersViewFromDocument(
      document([{ id: "a", name: "Alpha", description: "  runs of 2026 \n" }]),
      projects(),
    );

    expect(foldersDocumentFromView(view).folders[0]?.description).toBe("runs of 2026");
  });
});
