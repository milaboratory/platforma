import { describe, expect, expectTypeOf, test } from "vitest";
import type { PlRef, PrimaryRef } from "../ref";
import { createPlRef, createPrimaryRef } from "../ref";
import type { TemplateLocalRef } from "./project_template_v1";
import { createTemplateLocalRef } from "./project_template_v1";
import { fromTemplateForm, toTemplateForm, type TemplateForm } from "./template_form";

// Two blocks as a live project would hold them.
const samplesUuid = "3f1c2b7a-0000-4000-8000-000000000001";
const mixcrUuid = "3f1c2b7a-0000-4000-8000-000000000002";

describe("toTemplateForm", () => {
  test("a PlRef becomes a template-local reference naming block and output", () => {
    expect(toTemplateForm(createPlRef(samplesUuid, "reads"))).toEqual({
      block: samplesUuid,
      output: "reads",
    });
  });

  test("requireEnrichments is dropped — the file form has no slot for it", () => {
    // Enrichments are out of scope for templates (operator decision, 2026-07-30).
    expect(toTemplateForm(createPlRef(samplesUuid, "reads", true))).toEqual({
      block: samplesUuid,
      output: "reads",
    });
  });

  test("references are found at any depth, and non-reference values pass through", () => {
    const params = {
      species: "human",
      count: 3,
      enabled: true,
      missing: null,
      input: createPlRef(samplesUuid, "reads"),
      extra: [createPlRef(mixcrUuid, "clonotypes"), { nested: createPlRef(mixcrUuid, "qc") }],
    };

    expect(toTemplateForm(params)).toEqual({
      species: "human",
      count: 3,
      enabled: true,
      missing: null,
      input: { block: samplesUuid, output: "reads" },
      extra: [
        { block: mixcrUuid, output: "clonotypes" },
        { nested: { block: mixcrUuid, output: "qc" } },
      ],
    });
  });

  test("a PrimaryRef needs no special case — its nested refs convert, its marker survives", () => {
    const primary: PrimaryRef = createPrimaryRef(
      createPlRef(samplesUuid, "dataset"),
      createPlRef(samplesUuid, "filter"),
    );

    expect(toTemplateForm(primary)).toEqual({
      __isPrimaryRef: "v1",
      column: { block: samplesUuid, output: "dataset" },
      filter: { block: samplesUuid, output: "filter" },
    });
  });

  test("params with no references are returned unchanged in value", () => {
    const params = { dataset: "bulk-rna", threshold: 0.5 };
    expect(toTemplateForm(params)).toEqual(params);
  });
});

describe("fromTemplateForm", () => {
  const applyMap: Record<string, string> = { samples: samplesUuid, mixcr: mixcrUuid };
  const resolve = (id: string) => {
    const uuid = applyMap[id];
    if (uuid === undefined) throw new Error(`Unknown template-local id: ${id}`);
    return uuid;
  };

  test("a template-local reference becomes a PlRef against the freshly assigned UUID", () => {
    expect(fromTemplateForm<PlRef>(createTemplateLocalRef("samples", "reads"), resolve)).toEqual(
      createPlRef(samplesUuid, "reads"),
    );
  });

  test("an unresolvable id is the resolver's call to reject", () => {
    expect(() =>
      fromTemplateForm<PlRef>(createTemplateLocalRef("ghost", "reads"), resolve),
    ).toThrow(/Unknown template-local id: ghost/);
  });
});

describe("round trip", () => {
  test("export then apply reproduces the live params, with fresh UUIDs", () => {
    // A live project: mixcr's params reference samples by its project UUID.
    type Params = {
      input: PlRef;
      dataset: PrimaryRef;
      species: string;
      thresholds: number[];
    };
    const live: Params = {
      input: createPlRef(samplesUuid, "reads"),
      dataset: createPrimaryRef(createPlRef(samplesUuid, "dataset")),
      species: "human",
      thresholds: [0.1, 0.2],
    };

    // Export: ids are the UUIDs the blocks already have.
    const fileForm = toTemplateForm(live);

    // Apply into a fresh project: the same template ids map to new UUIDs.
    const reassigned: Record<string, string> = {
      [samplesUuid]: "9999aaaa-0000-4000-8000-00000000000a",
    };
    const applied = fromTemplateForm<Params>(fileForm, (id) => reassigned[id] ?? id);

    expect(applied).toEqual({
      input: createPlRef("9999aaaa-0000-4000-8000-00000000000a", "reads"),
      dataset: createPrimaryRef(createPlRef("9999aaaa-0000-4000-8000-00000000000a", "dataset")),
      species: "human",
      thresholds: [0.1, 0.2],
    });

    // Applying with an identity map returns exactly what the project held.
    expect(fromTemplateForm<Params>(fileForm, (id) => id)).toEqual(live);
  });
});

test("TemplateForm maps ref-carrying fields and leaves the rest alone", () => {
  // NOTE: unenforced by `pnpm test` — vitest runs without `--typecheck` and
  // tsconfig excludes *.test.ts. Verified by running tsc over this file.
  type Params = {
    input: PlRef;
    optional?: PlRef;
    many: PlRef[];
    species: string;
    nested: { primary: PrimaryRef };
  };

  expectTypeOf<TemplateForm<Params>>().toEqualTypeOf<{
    readonly input: TemplateLocalRef;
    readonly optional?: TemplateLocalRef;
    readonly many: readonly TemplateLocalRef[];
    readonly species: string;
    readonly nested: {
      readonly primary: {
        readonly __isPrimaryRef: "v1";
        readonly column: TemplateLocalRef;
        readonly filter?: TemplateLocalRef;
      };
    };
  }>();
});
