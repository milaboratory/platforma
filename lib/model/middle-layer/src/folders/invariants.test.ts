import { describe, expect, test } from "vitest";
import type { FoldersDocument } from "./document";
import { formatFoldersViolation, validateFoldersDocument } from "./invariants";
import { document, pid, tid } from "./test_utils";
import type { FoldersProjectInput } from "./view";

const kinds = (value: FoldersDocument, projects?: FoldersProjectInput[]) =>
  validateFoldersDocument(value, projects).map((violation) => violation.kind);

describe("validateFoldersDocument", () => {
  test("a project assigned to a nested folder is valid", () => {
    expect(
      validateFoldersDocument(
        document(
          [
            { id: "a", name: "A" },
            { id: "b", name: "B", parent: "a" },
            { id: "c", name: "C", parent: "b" },
          ],
          { p1: "c" },
        ),
        [{ id: pid("p1"), name: "Run" }],
      ),
    ).toEqual([]);
  });

  test("nesting has no limit: a long chain is a valid document", () => {
    const chain = Array.from({ length: 12 }, (_, index) => ({
      id: `f${index}`,
      name: `F${index}`,
      ...(index === 0 ? {} : { parent: `f${index - 1}` }),
    }));

    expect(kinds(document(chain))).toEqual([]);
  });

  test("a cycle is reported for every folder in it", () => {
    expect(
      kinds(
        document([
          { id: "a", name: "A", parent: "b" },
          { id: "b", name: "B", parent: "a" },
        ]),
      ),
    ).toEqual(["cycle", "cycle"]);
  });

  test("a folder hanging below a cycle is not reported as sitting in it", () => {
    const violations = validateFoldersDocument(
      document([
        { id: "a", name: "A", parent: "b" },
        { id: "b", name: "B", parent: "a" },
        { id: "c", name: "C", parent: "a" },
      ]),
    );
    expect(violations).toEqual([
      { kind: "cycle", folder: "a" },
      { kind: "cycle", folder: "b" },
    ]);
  });

  test("a folder named with whitespace only is reported", () => {
    expect(kinds(document([{ id: "a", name: "   " }]))).toEqual(["empty-folder-name"]);
  });

  test("a parent that is not there is reported", () => {
    expect(kinds(document([{ id: "a", name: "A", parent: "gone" }]))).toEqual(["missing-parent"]);
  });

  test("a folder id used twice is reported", () => {
    expect(
      kinds(
        document([
          { id: "a", name: "A" },
          { id: "a", name: "B" },
        ]),
      ),
    ).toEqual(["duplicate-folder-id"]);
  });

  test("names must be unique within one parent, ignoring case", () => {
    expect(
      kinds(
        document([
          { id: "a", name: "Samples" },
          { id: "b", name: "samples" },
        ]),
      ),
    ).toEqual(["duplicate-name"]);
  });

  test("the same name under different parents is fine", () => {
    expect(
      kinds(
        document([
          { id: "a", name: "A" },
          { id: "b", name: "B" },
          { id: "a1", name: "Runs", parent: "a" },
          { id: "b1", name: "Runs", parent: "b" },
        ]),
      ),
    ).toEqual([]);
  });

  test("a folder and a project inside the same parent share one namespace", () => {
    expect(kinds(document([{ id: "a", name: "Runs" }], { p1: "gone-nowhere" }), [])).toEqual([]);

    expect(kinds(document([{ id: "a", name: "Runs" }]), [{ id: pid("p1"), name: "runs" }])).toEqual(
      ["duplicate-name"],
    );
  });

  test("a template shares that namespace with folders, projects and other templates", () => {
    const withTemplates = (templates: { id: string; name: string }[]) =>
      validateFoldersDocument(
        document([{ id: "a", name: "Runs" }], { p1: "a" }, { t1: "a", t2: "a" }),
        [{ id: pid("p1"), name: "Pilot" }],
        templates.map((template) => ({ id: tid(template.id), name: template.name })),
      ).map((violation) => violation.kind);

    expect(withTemplates([{ id: "t1", name: "Snapshot" }])).toEqual([]);
    expect(withTemplates([{ id: "t1", name: "pilot" }])).toEqual(["duplicate-name"]);
    expect(
      withTemplates([
        { id: "t1", name: "Snapshot" },
        { id: "t2", name: "Snapshot" },
      ]),
    ).toEqual(["duplicate-name"]);
  });

  test("an assignment naming a folder that is not there is reported", () => {
    expect(kinds(document([], { p1: "gone" }), [{ id: pid("p1"), name: "Run" }])).toEqual([
      "unknown-assignment-folder",
    ]);
  });

  test("an assignment naming a project that is gone is not the document's problem", () => {
    expect(kinds(document([{ id: "a", name: "A" }], { ghost: "gone" }), [])).toEqual([]);
  });

  test("every violation formats to a line naming what is wrong", () => {
    const violations = validateFoldersDocument(
      document(
        [
          { id: "a", name: "A", parent: "gone" },
          { id: "b", name: "B" },
          { id: "b", name: "B" },
        ],
        { p1: "missing" },
      ),
      [{ id: pid("p1"), name: "Run" }],
    );

    expect(violations.length).toBeGreaterThan(0);
    for (const violation of violations) expect(formatFoldersViolation(violation)).not.toBe("");
  });
});
