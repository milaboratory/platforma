import { describe, expect, test } from "vitest";
import {
  decodeFoldersDocument,
  decodeStoredFoldersDocument,
  encodeFoldersDocument,
} from "./decode";
import { FOLDERS_SCHEMA_VERSION, emptyFoldersDocument } from "./document";
import { document } from "./test_utils";

const validDocument = document(
  [
    { id: "f1", name: "Samples" },
    { id: "f2", name: "Runs", parent: "f1" },
  ],
  { p1: "f2" },
  { t1: "f1" },
);

describe("decodeStoredFoldersDocument", () => {
  test("no stored document is a user with no folders, and writes stay allowed", () => {
    const decoded = decodeStoredFoldersDocument({ present: false });
    expect(decoded.document).toEqual(emptyFoldersDocument());
    expect(decoded.writable).toBe(true);
    expect(decoded.problem).toBeUndefined();
  });

  test("a stored document without bytes reads as no folders and refuses writes", () => {
    for (const raw of [undefined, ""]) {
      const decoded = decodeStoredFoldersDocument({ present: true, raw });
      expect(decoded.document).toEqual(emptyFoldersDocument());
      expect(decoded.writable).toBe(false);
      expect(decoded.problem).toEqual({
        kind: "unreadable",
        message: "the folder document is stored in a shape this build cannot read",
      });
    }
  });

  test("a stored document of whitespace only is not JSON, and refuses writes", () => {
    const decoded = decodeStoredFoldersDocument({ present: true, raw: "   " });
    expect(decoded.writable).toBe(false);
    expect(decoded.problem?.kind).toBe("unreadable");
  });

  test("a stored document with bytes is decoded", () => {
    const decoded = decodeStoredFoldersDocument({
      present: true,
      raw: JSON.stringify(validDocument),
    });
    expect(decoded.writable).toBe(true);
    expect(decoded.document).toEqual(validDocument);
  });
});

describe("decodeFoldersDocument", () => {
  test("a current document round-trips", () => {
    const encoded = encodeFoldersDocument(validDocument);
    const decoded = decodeFoldersDocument(encoded);
    expect(decoded.writable).toBe(true);
    expect(decoded.document).toEqual(validDocument);
  });

  test("a document written by a newer build reads as no folders and refuses writes", () => {
    const decoded = decodeFoldersDocument(
      JSON.stringify({ ...validDocument, schemaVersion: FOLDERS_SCHEMA_VERSION + 1 }),
    );
    expect(decoded.document).toEqual(emptyFoldersDocument());
    expect(decoded.writable).toBe(false);
    expect(decoded.problem?.kind).toBe("newer-schema");
    if (decoded.problem?.kind === "newer-schema")
      expect(decoded.problem.documentSchemaVersion).toBe(FOLDERS_SCHEMA_VERSION + 1);
  });

  test("invalid JSON reads as no folders and refuses writes", () => {
    const decoded = decodeFoldersDocument("{not json");
    expect(decoded.document).toEqual(emptyFoldersDocument());
    expect(decoded.writable).toBe(false);
    expect(decoded.problem?.kind).toBe("unreadable");
  });

  test("a document of the right version but the wrong shape refuses writes", () => {
    for (const value of [
      { ...validDocument, folders: "nope" },
      { ...validDocument, folders: [{ id: "f1" }] },
      { ...validDocument, folders: [{ id: "f1", name: "" }] },
      { ...validDocument, assignments: { p1: 7 } },
      { ...validDocument, templateAssignments: { t1: 7 } },
      { ...validDocument, extra: 1 },
      { schemaVersion: FOLDERS_SCHEMA_VERSION, folders: [], assignments: {} },
    ]) {
      const decoded = decodeFoldersDocument(JSON.stringify(value));
      expect(decoded.writable).toBe(false);
      expect(decoded.problem?.kind).toBe("unreadable");
      expect(decoded.document).toEqual(emptyFoldersDocument());
    }
  });

  test("a value that is not an object, or carries no usable version, refuses writes", () => {
    for (const value of [
      null,
      7,
      [],
      "text",
      {},
      { schemaVersion: "1" },
      { schemaVersion: 0 },
      { schemaVersion: 1.5 },
    ]) {
      const decoded = decodeFoldersDocument(JSON.stringify(value));
      expect(decoded.writable).toBe(false);
      expect(decoded.problem?.kind).toBe("unreadable");
    }
  });

  test("the problem names the schema version it checked against", () => {
    const decoded = decodeFoldersDocument(
      JSON.stringify({ ...validDocument, folders: [{ id: "f1" }] }),
    );
    expect(decoded.problem?.message).toBe(
      `the folder document does not match schema ${FOLDERS_SCHEMA_VERSION}: folders.0.name: Required`,
    );
  });

  test("the problem carries a message a log can be read from", () => {
    const decoded = decodeFoldersDocument("{not json");
    expect(decoded.problem?.message).toMatch(/folder document/);
  });
});
