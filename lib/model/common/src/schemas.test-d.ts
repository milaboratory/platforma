import type { Branded } from "@milaboratories/helpers";
import { describe, expectTypeOf, test } from "vitest";
import type {
  AnnotationJson,
  BlockOutput,
  Code,
  PlId,
  PlRef,
  RangeBytes,
  TraceEntry,
  ValueType,
  readAnnotationJson,
  readAnnotationJsonOrThrow,
  readDomainJson,
  readDomainJsonOrThrow,
} from "./index";
import { Annotation } from "./index";

type ExpectedAnnotationValues = {
  [Annotation.DiscreteValues]: number[] | string[];
  [Annotation.Graph.Axis.HighCardinality]: boolean;
  [Annotation.Graph.Axis.LowerLimit]: number;
  [Annotation.Graph.Axis.SymmetricRange]: boolean;
  [Annotation.Graph.Axis.UpperLimit]: number;
  [Annotation.Graph.IsDenseAxis]: boolean;
  [Annotation.Graph.IsVirtual]: boolean;
  [Annotation.Graph.Palette]: {
    name: string;
    mapping?: Record<string, number>;
    midPoint?: number;
    min?: number;
    max?: number;
    log?: boolean;
  };
  [Annotation.Graph.Shape]: { mapping: Record<string, string> };
  [Annotation.Graph.Thresholds]: {
    columnId: { valueType: ValueType; name: string };
    value: number;
  }[];
  [Annotation.Graph.TreatAbsentValuesAs]: number;
  [Annotation.HideDataFromGraphs]: boolean;
  [Annotation.HideDataFromUi]: boolean;
  [Annotation.IsDiscreteFilter]: boolean;
  [Annotation.IsLinkerColumn]: boolean;
  [Annotation.IsSubset]: boolean;
  [Annotation.Max]: number;
  [Annotation.Min]: number;
  [Annotation.MultipliesBy]: string[];
  [Annotation.Parents]: string[];
  [Annotation.Sequence.Annotation.Mapping]: Record<string, string>;
  [Annotation.Sequence.IsAnnotation]: boolean;
  [Annotation.Table.OrderPriority]: number;
  [Annotation.Trace]: TraceEntry[];
  [Annotation.VDJ.IsAssemblingFeature]: boolean;
};

describe("schema output types", () => {
  test("annotation readers return the annotation value types", () => {
    expectTypeOf<{
      [K in keyof AnnotationJson]: ReturnType<typeof readAnnotationJson<K>>;
    }>().toEqualTypeOf<{
      [K in keyof ExpectedAnnotationValues]: ExpectedAnnotationValues[K] | undefined;
    }>();
    expectTypeOf<{
      [K in keyof AnnotationJson]: ReturnType<typeof readAnnotationJsonOrThrow<K>>;
    }>().toEqualTypeOf<{
      [K in keyof ExpectedAnnotationValues]: ExpectedAnnotationValues[K] | undefined;
    }>();
  });

  test("domain readers have no JSON keys", () => {
    expectTypeOf<Parameters<typeof readDomainJson>[1]>().toEqualTypeOf<never>();
    expectTypeOf<Parameters<typeof readDomainJsonOrThrow>[1]>().toEqualTypeOf<never>();
  });

  test("schema types stay the same", () => {
    expectTypeOf<TraceEntry>().toEqualTypeOf<
      { type: string; label: string } & { [k: string]: unknown }
    >();
    expectTypeOf<BlockOutput>().toEqualTypeOf<Readonly<{ blockId: string; name: string }>>();
    expectTypeOf<PlRef>().toEqualTypeOf<
      Readonly<{
        __isRef: true;
        blockId: string;
        name: string;
        requireEnrichments?: true | undefined;
      }>
    >();
    expectTypeOf<PlId>().toEqualTypeOf<Branded<string, "PlId">>();
    expectTypeOf<Code>().toEqualTypeOf<{ type: "plain"; content: string }>();
    expectTypeOf<RangeBytes>().toEqualTypeOf<{ from: number; to: number }>();
  });
});
