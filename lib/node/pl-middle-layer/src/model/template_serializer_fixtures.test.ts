import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import YAML from "yaml";
import type { BlockKindReference } from "@milaboratories/pl-model-common";
import { createTemplateLocalRef, parseProjectTemplateV1 } from "@milaboratories/pl-model-common";
import type { ProjectStructure } from "./project_model";
import type { TemplateParamsResult } from "./template_export";
import { exportProjectAsTemplateV1 } from "./template_serializer";

/**
 * Golden-file tests for the exported document's TEXT.
 *
 * The sibling `template_serializer.test.ts` asserts the document field by field,
 * which says nothing about how it is rendered. These pin the bytes: key order,
 * indentation, how `params` nests, which scalars get quoted, and that nothing is
 * line-folded. That is what "export emits exactly what import parses" rests on,
 * and what makes a diff between two exported templates readable.
 *
 * Each expected file lives on disk rather than in a snapshot, deliberately. There
 * is no snapshot infrastructure in this repo to fit into, and a snapshot carries an
 * `-u` flag that rewrites the expectation without anyone reading it — for a file
 * format promised to a second implementation, changing the expectation should be a
 * deliberate edit that shows up in review. To update one, run the test, read the
 * diff, and write the new content in by hand.
 *
 * Every fixture is also parsed back with the import-side parser, so a golden file
 * can never be updated to something import cannot read.
 */
const FIXTURE_DIR = join(import.meta.dirname, "..", "..", "test_fixtures", "template-v1");

const ok = (value: unknown): TemplateParamsResult => ({ value });

const kind = (name: string, version: string) =>
  `@platforma-open/milaboratories.${name}.kind@${version}` as BlockKindReference;

function structureOf(...ids: string[]): ProjectStructure {
  return {
    groups: [
      {
        id: "g1",
        label: "Main",
        blocks: ids.map((id) => ({ id, label: id, renderingMode: "Heavy" })),
      },
    ],
  };
}

type Fixture = {
  /** File under `test_fixtures/template-v1/`, and the test's name. */
  readonly file: string;
  /** What each fixture is here to pin — one property per fixture, not a grab bag. */
  readonly pins: string;
  readonly structure: ProjectStructure;
  readonly params: Record<string, TemplateParamsResult>;
  readonly kinds: Record<string, BlockKindReference>;
};

const FIXTURES: readonly Fixture[] = [
  {
    file: "empty-project.yaml",
    pins: "an empty project is still a valid document, not an empty file",
    structure: structureOf(),
    params: {},
    kinds: {},
  },
  {
    file: "minimal.yaml",
    pins: "the schema marker comes first, and a block with no templateParams gets no params key",
    structure: structureOf("11111111-1111-4111-8111-111111111111"),
    params: { "11111111-1111-4111-8111-111111111111": ok(undefined) },
    kinds: { "11111111-1111-4111-8111-111111111111": kind("pool-explorer", "1.0.0") },
  },
  {
    file: "linear-chain.yaml",
    pins: "the canonical shape — three blocks wired in a chain, ids reused verbatim",
    structure: structureOf(
      "aaaaaaaa-0000-4000-8000-000000000001",
      "bbbbbbbb-0000-4000-8000-000000000002",
      "cccccccc-0000-4000-8000-000000000003",
    ),
    params: {
      "aaaaaaaa-0000-4000-8000-000000000001": ok({ dataset: "bulk-rna" }),
      "bbbbbbbb-0000-4000-8000-000000000002": ok({
        input: createTemplateLocalRef("aaaaaaaa-0000-4000-8000-000000000001", "reads"),
        species: "hsa",
      }),
      "cccccccc-0000-4000-8000-000000000003": ok({
        clonotypes: createTemplateLocalRef("bbbbbbbb-0000-4000-8000-000000000002", "clonotypes"),
      }),
    },
    kinds: {
      "aaaaaaaa-0000-4000-8000-000000000001": kind("import-fastq", "2.1.0"),
      "bbbbbbbb-0000-4000-8000-000000000002": kind("mixcr-clonotyping", "3.0.4"),
      "cccccccc-0000-4000-8000-000000000003": kind("clonotype-browser", "1.2.10"),
    },
  },
  {
    file: "nested-params.yaml",
    pins: "how nesting renders — objects in arrays, references at depth, an empty object",
    structure: structureOf(
      "dddddddd-0000-4000-8000-000000000004",
      "ffffffff-0000-4000-8000-000000000006",
    ),
    params: {
      "dddddddd-0000-4000-8000-000000000004": ok({}),
      "ffffffff-0000-4000-8000-000000000006": ok({
        thresholds: { min: 0.01, max: 1, exact: 0.5 },
        steps: [
          { name: "filter", enabled: true },
          { name: "cluster", enabled: false, seed: 42 },
        ],
        // Two references to the same upstream, inside an array.
        inputs: [
          createTemplateLocalRef("dddddddd-0000-4000-8000-000000000004", "a"),
          createTemplateLocalRef("dddddddd-0000-4000-8000-000000000004", "b"),
        ],
        advanced: {},
        tags: [],
        note: null,
      }),
    },
    kinds: {
      "dddddddd-0000-4000-8000-000000000004": kind("import-fastq", "2.1.0"),
      "ffffffff-0000-4000-8000-000000000006": kind("clonotype-clustering", "0.4.1"),
    },
  },
  {
    file: "scalar-quoting.yaml",
    pins: "strings that YAML would otherwise read back as something else stay strings",
    structure: structureOf("eeeeeeee-0000-4000-8000-000000000005"),
    params: {
      "eeeeeeee-0000-4000-8000-000000000005": ok({
        // Each of these is a real hazard: unquoted, some YAML reader turns them
        // into a boolean, a number, a null, an alias, or a nested mapping.
        // The first group is 1.1-only — a 1.2 emitter leaves them bare.
        looksBoolean: "yes",
        looksBooleanNo: "no",
        looksBooleanOn: "on",
        looksBooleanOff: "off",
        looksBooleanY: "y",
        looksBooleanN: "n",
        looksSexagesimal: "1:30",
        looksBooleanToo: "true",
        looksNumeric: "1.0",
        looksOctal: "0755",
        looksNull: "null",
        looksEmpty: "",
        hasColon: "label: value",
        startsWithAsterisk: "*anchor",
        startsWithHash: "#not-a-comment",
        startsWithDash: "-dash",
        multiline: "first\nsecond",
        unicode: "受容体 — αβ",
        // Long enough to be folded at any default width; folding is switched off.
        long: `${"x".repeat(200)} ${"y".repeat(200)}`,
        actuallyBoolean: true,
        actuallyNumeric: 1,
      }),
    },
    kinds: { "eeeeeeee-0000-4000-8000-000000000005": kind("enter-numbers", "1.0.0") },
  },
];

function exportFixture(fixture: Fixture) {
  const result = exportProjectAsTemplateV1(
    fixture.structure,
    (blockId) => fixture.params[blockId],
    (blockId) => fixture.kinds[blockId],
  );
  if (!result.ok)
    throw new Error(
      `fixture '${fixture.file}' failed to export: ${result.problems.map((p) => p.error).join("; ")}`,
    );
  return result;
}

describe.each(FIXTURES)("$file", (fixture) => {
  test(`renders as the golden file — ${fixture.pins}`, () => {
    const expected = readFileSync(join(FIXTURE_DIR, fixture.file), "utf-8");

    // Compared as text, not as a parsed value: the parsed comparison is the test
    // below, and it cannot see formatting at all.
    expect(exportFixture(fixture).yaml).toBe(expected);
  });

  test("the golden file parses back to the document it was rendered from", () => {
    const result = exportFixture(fixture);
    const fromDisk = readFileSync(join(FIXTURE_DIR, fixture.file), "utf-8");

    expect(parseProjectTemplateV1(YAML.parse(fromDisk))).toEqual(result.document);
  });
});

describe("what the golden files guard", () => {
  test("no scalar is line-folded, however long", () => {
    const yaml = exportFixture(FIXTURES.find((f) => f.file === "scalar-quoting.yaml")!).yaml;

    // A folded scalar shows up as a continuation line; the value must stay on one.
    const long = `${"x".repeat(200)} ${"y".repeat(200)}`;
    expect(yaml).toContain(long);
  });

  test("scalars only YAML 1.1 would misread are quoted", () => {
    // The emitter quotes against 1.1 rules even though we parse as 1.2, because the
    // file is read by other implementations: PyYAML and Go's yaml.v2 default to 1.1,
    // where a bare `yes` is `true` and a bare `1:30` is `90`. A 1.2 emitter leaves
    // both bare, so this is the one formatting choice that is an interop bug rather
    // than a matter of taste — and a round trip through our own parser cannot catch
    // it, since 1.2 reads them back as strings either way.
    const yaml = exportFixture(FIXTURES.find((f) => f.file === "scalar-quoting.yaml")!).yaml;

    for (const bare of ["yes", "no", "on", "off", "y", "n", "1:30"]) {
      expect(yaml).toContain(`: "${bare}"`);
      expect(yaml).not.toContain(`: ${bare}\n`);
    }
  });

  test("a document with no blocks is an empty sequence, not a null", () => {
    // `blocks:` alone would parse as null and fail the schema, turning an empty
    // project into an unreadable file.
    const yaml = exportFixture(FIXTURES.find((f) => f.file === "empty-project.yaml")!).yaml;

    expect(yaml).toContain("blocks: []");
  });
});
