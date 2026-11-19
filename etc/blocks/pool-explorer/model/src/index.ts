import {
  Annotation,
  BlockModelV3,
  DataModelBuilder,
  type InferHrefType,
  type InferOutputsType,
  isPColumnSpec,
  type PlRef,
  readAnnotation,
  readAnnotationJsonOrThrow,
  type TraceEntry,
} from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.pool-explorer.kind";

/**
 * Pool Explorer persists nothing: the page renders whatever the result pool
 * currently exposes, and its filter controls are local Vue state. The kind's
 * `BlockParams` is empty for the same reason, so `init` takes no params.
 */
export type BlockData = Record<string, never>;

export type BlockArgs = BlockData;

const dataModel = new DataModelBuilder({ kind }).from<BlockData>("v1").init(() => ({}));

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args<BlockArgs>(() => ({}))

  // Nothing to project: this block is a result-pool diagnostic with no configuration
  // of its own — its filter state lives in the Vue component, not in block data.
  .templateParams(() => ({}))

  .output("allSpecs", (ctx) => ctx.resultPool.getSpecs())

  .output("columnTraces", (ctx): ColumnTraces => {
    const { entries, isComplete } = ctx.resultPool.getSpecs();
    const optionLabels = new Map(
      ctx.resultPool.getOptions(isPColumnSpec).map((o) => [columnKey(o.ref), o.label]),
    );
    const columns = entries.flatMap(({ ref, obj }) => {
      if (!isPColumnSpec(obj)) return [];
      const key = columnKey(ref);
      return [
        {
          key,
          optionLabel: optionLabels.get(key) ?? obj.name,
          blockId: ref.blockId,
          name: obj.name,
          nativeLabel: readAnnotation(obj, Annotation.Label),
          rawTrace: readAnnotation(obj, Annotation.Trace),
          ...parseTrace(obj),
        },
      ];
    });
    return { columns, isComplete };
  })

  .sections((_ctx) => {
    return [
      { type: "link", href: "/", label: "Main" },
      { type: "link", href: "/traces", label: "Traces" },
    ];
  })

  .title((_ctx) => "Pool explorer")

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;

/** One result-pool column with its trace parsed for reading. */
export type ColumnTrace = {
  /** `<blockId>/<column name>`; stable while the producing block keeps the column. */
  key: string;
  /** Label the column gets in a dropdown listing every column of the pool. */
  optionLabel: string;
  blockId: string;
  name: string;
  nativeLabel: string | undefined;
  /** The `pl7.app/trace` annotation exactly as stored. */
  rawTrace: string | undefined;
} & ({ trace: TraceEntry[] } | { traceError: string });

export type ColumnTraces = { columns: ColumnTrace[]; isComplete: boolean };

// Internals

function columnKey(ref: PlRef): string {
  return `${ref.blockId}/${ref.name}`;
}

function parseTrace(spec: Parameters<typeof readAnnotationJsonOrThrow>[0]) {
  try {
    return { trace: readAnnotationJsonOrThrow(spec, Annotation.Trace) ?? [] };
  } catch (e) {
    return { traceError: e instanceof Error ? e.message : String(e) };
  }
}
