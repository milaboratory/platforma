import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  PROJECT_TEMPLATE_SCHEMA_V1,
  createTemplateLocalRef,
} from "@milaboratories/pl-model-common";
import { parseProjectTemplateV1Yaml } from "./template_parser";
import { stringifyProjectTemplateV1 } from "./template_serializer";

const FIXTURE_DIR = join(import.meta.dirname, "..", "..", "test_fixtures", "template-v1");

const KIND = "@platforma-open/milaboratories.demo.kind@^1.0.0";

/** The document, or a test failure naming what went wrong instead. */
function documentOf(text: string) {
  const outcome = parseProjectTemplateV1Yaml(text);
  if (!outcome.ok) throw new Error(`expected a document, got: ${outcome.error}`);
  return outcome.document;
}

/** The error message, or a test failure if the text parsed after all. */
function errorOf(text: string): string {
  const outcome = parseProjectTemplateV1Yaml(text);
  if (outcome.ok) throw new Error("expected a failure, but the text parsed");
  return outcome.error;
}

describe("parseProjectTemplateV1Yaml", () => {
  test("reads a file into the document import applies", () => {
    const document = documentOf(
      [
        `schema: ${PROJECT_TEMPLATE_SCHEMA_V1}`,
        "blocks:",
        "  - id: first",
        `    kind: "${KIND}"`,
        "    params:",
        "      dataset: bulk-rna",
        "  - id: second",
        `    kind: "${KIND}"`,
        "    params:",
        "      input:",
        "        block: first",
        "        output: reads",
        "",
      ].join("\n"),
    );

    expect(document.blocks).toEqual([
      { id: "first", kind: KIND, params: { dataset: "bulk-rna" } },
      { id: "second", kind: KIND, params: { input: createTemplateLocalRef("first", "reads") } },
    ]);
  });

  test("an entry without params keeps the key absent", () => {
    // The parser reports what the file says and invents nothing, so a missing key stays
    // missing; whoever applies the document is what reads it as `{}`.
    const [entry] = documentOf(
      `schema: ${PROJECT_TEMPLATE_SCHEMA_V1}\nblocks:\n  - id: a\n    kind: "${KIND}"\n`,
    ).blocks;

    expect("params" in entry).toBe(false);
  });

  test("JSON is accepted, being valid YAML", () => {
    // Not a feature to advertise, but a file someone hand-wrote as JSON should not be
    // rejected for a reason that has nothing to do with its contents.
    const document = documentOf(
      JSON.stringify({
        schema: PROJECT_TEMPLATE_SCHEMA_V1,
        blocks: [{ id: "a", kind: KIND }],
      }),
    );

    expect(document.blocks).toHaveLength(1);
  });

  test("every golden export file reads back", () => {
    // The other side of the round trip, checked against the files the export tests
    // pin: whatever export writes, this reads. A fixture that stopped parsing here
    // would mean the two halves had drifted apart.
    const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".yaml"));

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(join(FIXTURE_DIR, file), "utf-8");
      const outcome = parseProjectTemplateV1Yaml(text);

      expect(outcome.ok, `${file}: ${outcome.ok ? "" : outcome.error}`).toBe(true);
    }
  });

  test("a document survives being written and read again", () => {
    // Text → document → text → document. Pins the two text layers against each other
    // rather than against a fixture, so a change to either shows up here.
    const original = documentOf(
      `schema: ${PROJECT_TEMPLATE_SCHEMA_V1}\nblocks:\n  - id: a\n    kind: "${KIND}"\n    params:\n      n: 1\n`,
    );

    expect(documentOf(stringifyProjectTemplateV1(original))).toEqual(original);
  });
});

describe("what a broken file says", () => {
  test("an empty file is called empty", () => {
    // Blank input, whitespace and comment-only files all parse to null, where the
    // schema would report a type mismatch instead of the actual mistake.
    expect(errorOf("")).toBe("The file is empty.");
    expect(errorOf("   \n\n")).toBe("The file is empty.");
    expect(errorOf("# just a comment\n")).toBe("The file is empty.");
  });

  test("a YAML syntax error is located, without a code frame", () => {
    // The position is what a person needs; the frame duplicates the editor they are
    // already looking at.
    const error = errorOf(
      `schema: ${PROJECT_TEMPLATE_SCHEMA_V1}\nblocks:\n  - id: a\n   kind: x\n`,
    );

    expect(error).toContain("not valid YAML");
    expect(error).toContain("line 4");
    expect(error).not.toContain("\n");
  });

  test("a repeated key is reported rather than silently dropped", () => {
    // A realistic hand-editing mistake: copy an entry, forget to change a field. YAML
    // would otherwise keep one of the two and the file would apply, wrongly.
    const error = errorOf(
      `schema: ${PROJECT_TEMPLATE_SCHEMA_V1}\nblocks:\n  - id: a\n    id: b\n    kind: "${KIND}"\n`,
    );

    expect(error).toContain("not valid YAML");
    expect(error).toMatch(/keys must be unique/i);
  });

  test("tabs are reported as such", () => {
    // Tab indentation is invalid YAML and the failure is otherwise baffling.
    expect(errorOf("schema: x\n\tblocks: []\n")).toMatch(/tabs/i);
  });

  test("something that is not a mapping says what was expected", () => {
    expect(errorOf("a plain string\n")).toContain("expected a mapping");
    expect(errorOf("- a\n- b\n")).toContain("expected a mapping");
  });

  test("the wrong kind of file is named as such, not as a type error", () => {
    // The likeliest mistake of all — a file picker was pointed at the wrong file — so
    // it gets its own message rather than the schema's literal-mismatch wording.
    expect(errorOf("schema: template-v2\nblocks: []\n")).toBe(
      `This file says it is 'template-v2', not ${PROJECT_TEMPLATE_SCHEMA_V1}.`,
    );
    expect(errorOf("blocks: []\n")).toBe(
      `This file has no 'schema' field, so it is not a ${PROJECT_TEMPLATE_SCHEMA_V1} template.`,
    );
  });

  test("a schema problem is located the way the file is written", () => {
    // `blocks[0].kind`, not the parser's `blocks.0.kind`: the reader finds it by
    // reading, not by counting.
    const error = errorOf(`schema: ${PROJECT_TEMPLATE_SCHEMA_V1}\nblocks:\n  - id: a\n`);

    expect(error).toContain("- blocks[0].kind:");
  });

  test("every schema problem is listed, and counted", () => {
    // One pass to fix the file, not one pass per problem.
    const error = errorOf(
      [`schema: ${PROJECT_TEMPLATE_SCHEMA_V1}`, "blocks:", "  - id: a", "  - id: b", ""].join("\n"),
    );

    expect(error).toContain("2 problems:");
    expect(error).toContain("- blocks[0].kind:");
    expect(error).toContain("- blocks[1].kind:");
  });

  test("a malformed kind reference explains the grammar", () => {
    const error = errorOf(
      `schema: ${PROJECT_TEMPLATE_SCHEMA_V1}\nblocks:\n  - id: a\n    kind: no-version\n`,
    );

    expect(error).toContain("blocks[0].kind:");
    expect(error).toContain("{name}@{selector}");
  });

  test("two entries with the same id are rejected", () => {
    // Template-local ids are what references name, so a duplicate makes a reference
    // ambiguous — and the apply would map one id to two blocks.
    const error = errorOf(
      [
        `schema: ${PROJECT_TEMPLATE_SCHEMA_V1}`,
        "blocks:",
        "  - id: a",
        `    kind: "${KIND}"`,
        "  - id: a",
        `    kind: "${KIND}"`,
        "",
      ].join("\n"),
    );

    expect(error).toContain("Duplicate template-local id: a");
  });

  test("an unknown field is refused, not ignored", () => {
    // A misspelled key that was silently dropped would apply a file that does not say
    // what the author meant.
    const error = errorOf(
      `schema: ${PROJECT_TEMPLATE_SCHEMA_V1}\nblocks:\n  - id: a\n    kind: "${KIND}"\n    parms: {}\n`,
    );

    expect(error).toMatch(/Unrecognized key/);
  });
});

describe("scalars in params", () => {
  test("what looks like a string stays a string", () => {
    // Read as YAML 1.2 on purpose. Under 1.1 — PyYAML's default — a bare `yes` is
    // `true` and `1:30` is `90`, so a hand-written file would silently change meaning
    // depending on who wrote it. The export side quotes these anyway, which is the
    // other half of the same decision.
    const [entry] = documentOf(
      [
        `schema: ${PROJECT_TEMPLATE_SCHEMA_V1}`,
        "blocks:",
        "  - id: a",
        `    kind: "${KIND}"`,
        "    params:",
        "      answer: yes",
        "      duration: 1:30",
        "",
      ].join("\n"),
    ).blocks;

    expect(entry.params).toEqual({ answer: "yes", duration: "1:30" });
  });

  test("numbers and booleans written as such stay themselves", () => {
    const [entry] = documentOf(
      [
        `schema: ${PROJECT_TEMPLATE_SCHEMA_V1}`,
        "blocks:",
        "  - id: a",
        `    kind: "${KIND}"`,
        "    params:",
        "      count: 42",
        "      ratio: 0.5",
        "      enabled: true",
        "      missing: null",
        "",
      ].join("\n"),
    ).blocks;

    expect(entry.params).toEqual({ count: 42, ratio: 0.5, enabled: true, missing: null });
  });
});
