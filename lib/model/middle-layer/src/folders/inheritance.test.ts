import { describe, expect, test } from "vitest";
import { inheritedFolder } from "./inheritance";
import { fid, pid, project, template, view } from "./test_utils";

describe("what a new item inherits from the project it was made from", () => {
  test("a copy lands in the folder holding its source", () => {
    const tree = view([{ id: "a", name: "Samples" }], [{ id: "p1", name: "Run", folder: "a" }]);

    expect(inheritedFolder(tree, pid("p1"), project("p2"), "Run (Copy)")).toBe(fid("a"));
  });

  test("a template taken from a project lands in that project's folder", () => {
    const tree = view([{ id: "a", name: "Samples" }], [{ id: "p1", name: "Run", folder: "a" }]);

    expect(inheritedFolder(tree, pid("p1"), template("t1"), "Run (Copy)")).toBe(fid("a"));
  });

  test("a template is held to the names of the templates in that folder only", () => {
    const tree = view(
      [{ id: "a", name: "Samples" }],
      [{ id: "p1", name: "Run", folder: "a" }],
      [{ id: "t2", name: "Pilot", folder: "a" }],
    );

    // "Run" is the source project's own name, which a template may carry beside it.
    expect(inheritedFolder(tree, pid("p1"), template("t1"), "Run")).toBe(fid("a"));
    expect(inheritedFolder(tree, pid("p1"), template("t1"), "pilot")).toBeUndefined();
  });

  test("a source at the top level leaves the new item at the top level", () => {
    const tree = view([{ id: "a", name: "Samples" }], [{ id: "p1", name: "Run" }]);

    expect(inheritedFolder(tree, pid("p1"), project("p2"), "Run (Copy)")).toBeUndefined();
  });

  test("a source that is no longer in the tree places nothing", () => {
    const tree = view([{ id: "a", name: "Samples" }], []);

    expect(inheritedFolder(tree, pid("ghost"), project("p2"), "Run (Copy)")).toBeUndefined();
  });

  test("a name already taken in that folder leaves the copy at the top level", () => {
    const tree = view(
      [{ id: "a", name: "Samples" }],
      [
        { id: "p1", name: "Run", folder: "a" },
        { id: "p2", name: "Run (Copy)", folder: "a" },
      ],
    );

    expect(inheritedFolder(tree, pid("p1"), project("p3"), "Run (Copy)")).toBeUndefined();
  });

  test("a child folder's name does not block a project: each kind has its own namespace", () => {
    const tree = view(
      [
        { id: "a", name: "Samples" },
        { id: "b", name: "Run (Copy)", parent: "a" },
      ],
      [{ id: "p1", name: "Run", folder: "a" }],
    );

    expect(inheritedFolder(tree, pid("p1"), project("p2"), "Run (Copy)")).toBe(fid("a"));
  });

  test("a name taken elsewhere in the tree does not block the placement", () => {
    // Uniqueness is per parent, never global: the copy is placed although another project at the
    // top level already carries the name it is being given.
    const tree = view(
      [{ id: "a", name: "Samples" }],
      [
        { id: "p1", name: "Run", folder: "a" },
        { id: "p2", name: "Run (Copy)" },
      ],
    );

    expect(inheritedFolder(tree, pid("p1"), project("p2"), "Run (Copy)")).toBe(fid("a"));
  });

  test("the comparison ignores case, exactly as the naming rule does", () => {
    const tree = view(
      [{ id: "a", name: "Samples" }],
      [
        { id: "p1", name: "Run", folder: "a" },
        { id: "p2", name: "RUN (COPY)", folder: "a" },
      ],
    );

    expect(inheritedFolder(tree, pid("p1"), project("p3"), "Run (Copy)")).toBeUndefined();
  });
});
