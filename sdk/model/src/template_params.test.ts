import { describe, expect, expectTypeOf, test } from "vitest";
import type { PlRef } from "@milaboratories/pl-model-common";
import { createPlRef, stringifyJson } from "@milaboratories/pl-model-common";
import { createBlockStorage } from "./block_storage";
import { deriveTemplateParamsFromStorage } from "./block_storage_callbacks";
import { BlockModelV3 } from "./block_model";
import { DataModelBuilder } from "./block_migrations";
import { defineBlockKind } from "@platforma-sdk/block-kind";

// A kind whose params carry a reference — the case that exercises the rewrite.
type Params = { sources?: PlRef[]; label: string };

const kind = defineBlockKind<Params>({
  name: "@platforma-open/milaboratories.demo.kind",
  version: "1.0.0",
  // These tests are about the export direction, so the parser only carries the shape
  // through; rejection behaviour lives in `template_init.test.ts`.
  parseInitializationParams: (value) => value as Params,
});

type BlockData = { sources: PlRef[]; label: string; scratch: number };

const dataModel = new DataModelBuilder({ kind }).from<BlockData>("v1").init(({ params }) => ({
  sources: params?.sources ?? [],
  label: params?.label ?? "",
  // Derived/runtime state — must NOT survive into a template entry.
  scratch: 0,
}));

const upstream = "3f1c2b7a-0000-4000-8000-000000000001";

const storageOf = (data: BlockData) => stringifyJson(createBlockStorage(data));

describe("deriveTemplateParamsFromStorage", () => {
  test("projects data back to params, with each reference marked", () => {
    const result = deriveTemplateParamsFromStorage(
      storageOf({ sources: [createPlRef(upstream, "reads")], label: "run 1", scratch: 42 }),
      (data) => {
        const d = data as BlockData;
        return { sources: d.sources, label: d.label };
      },
    );

    // `scratch` is dropped because the lambda does not return it; the `PlRef` was wrapped
    // without the lambda doing anything, which is the point — marking references is the
    // SDK's job, not a block author's.
    expect(result).toEqual({
      value: { sources: [{ $ref: createPlRef(upstream, "reads") }], label: "run 1" },
    });
  });

  test("a block with nothing to project yields empty params, not absent ones", () => {
    // Every block declares the lambda, so there is no "no params" outcome to test for.
    // A block whose state carries nothing worth restoring returns `{}`, and `{}` is what
    // gets written — the entry is still checked against the kind on the way back in.
    expect(
      deriveTemplateParamsFromStorage(
        storageOf({ sources: [], label: "", scratch: 0 }),
        () => ({}),
      ),
    ).toEqual({ value: {} });
  });

  test("a throwing lambda is reported, not propagated", () => {
    const result = deriveTemplateParamsFromStorage(
      storageOf({ sources: [], label: "", scratch: 0 }),
      () => {
        throw new Error("not exportable yet");
      },
    );

    expect(result).toEqual({ error: "templateParams() threw: not exportable yet" });
  });
});

describe("BlockModelV3.templateParams", () => {
  test("the lambda's return type is the kind's params", () => {
    const model = BlockModelV3.create({ dataModel, kind })
      .args((data) => ({ label: data.label }))
      .templateParams((data) => ({ sources: data.sources, label: data.label }));

    expectTypeOf(model.templateParams).parameter(0).toEqualTypeOf<(data: BlockData) => Params>();
  });

  test("a projection that drifts from the kind's params does not compile", () => {
    const builder = BlockModelV3.create({ dataModel, kind }).args((data) => ({
      label: data.label,
    }));

    // @ts-expect-error - `label` is required by Params
    builder.templateParams((data) => ({ sources: data.sources }));
    // @ts-expect-error - wrong type for a declared param
    builder.templateParams(() => ({ label: 42 }));
  });

  test("KNOWN HOLE: an extra field the kind does not declare is not rejected", () => {
    const builder = BlockModelV3.create({ dataModel, kind }).args((data) => ({
      label: data.label,
    }));

    // No `@ts-expect-error` here, and that is the point: TypeScript does not
    // apply excess-property checks to an object literal returned from a
    // contextually-typed arrow, so `scratch` type-checks and would be written
    // into the exported file. The kind's parser does not catch it either — that runs
    // on params coming IN, and nothing runs on what the projection hands back. The
    // asymmetry is real: such a file is written happily and rejected on re-import by
    // the same kind that would have caught it here. This test pins current behaviour.
    builder.templateParams((data) => ({
      label: data.label,
      sources: data.sources,
      scratch: data.scratch,
    }));
  });

  test("a model that declares it builds", () => {
    expect(() =>
      BlockModelV3.create({ dataModel, kind })
        .args((data) => ({ label: data.label }))
        .templateParams((data) => ({ sources: data.sources, label: data.label }))
        .done(),
    ).not.toThrow();
  });

  test("a model that omits it does not build", () => {
    // The projection is not optional. Without this gate a block exports an entry with
    // no params, which applies as a default-initialized block that looks restored — so
    // the failure has to land on whoever wrote the model, at build.
    expect(() =>
      BlockModelV3.create({ dataModel, kind })
        .args((data) => ({ label: data.label }))
        .done(),
    ).toThrow(/templateParams\(\) not set/);
  });
});
