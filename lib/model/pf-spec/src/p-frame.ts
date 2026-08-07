import type {
  EvaluateQueryResponse,
  JoinEntry,
  PColumnIdAndSpec,
  PColumnSpec,
  PColumnValue,
  PObjectId,
  PTableRecordFilter,
  PTableSorting,
  SpecQuery,
} from "@milaboratories/pl-model-common";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import { spec as bindings } from "./generated/pframes_rs_wasip2.js";

/** A legacy (V4) query. Code used this type before the unified `SpecQuery`. */
export type LegacyQuery = {
  /** The source join entry. It defines the data sources and the join structure. */
  src: JoinEntry<PObjectId>;
  /** Optional record-level filters. The query applies these to its results. */
  filters?: PTableRecordFilter[];
  /** Optional sort specifications. They set the order of the results. */
  sorting?: PTableSorting[];
};

/**
 * A set of registered column specs, and the spec-plane operations on them.
 *
 * Each method uses the specs that this frame holds. No method reads data. The module
 * surface holds the spec operations that do not need a frame.
 *
 * This class holds a WASM resource. Use a `using` declaration to release it. Garbage
 * collection also releases the resource, but not at a known time.
 */
export class PFrame implements Disposable {
  #frame: bindings.Frame;

  constructor(spec: Record<string, PColumnSpec>) {
    this.#frame = bindings.Frame.fromJson(JSON.stringify(spec));
  }

  /** Deletes columns from a columns specification. */
  deleteColumns(
    request: PFrameInternal.DeleteColumnFromColumnsRequest,
  ): PFrameInternal.DeleteColumnFromColumnsResponse {
    return JSON.parse(bindings.Frame.deleteColumns(JSON.stringify(request)));
  }

  /** Returns `null` if this frame has no column with the id `columnId`. */
  getColumn(columnId: PObjectId): PColumnIdAndSpec | null {
    return JSON.parse(this.#frame.getColumn(JSON.stringify(columnId)));
  }

  /** Lists each column in this frame with its id and its spec. */
  listColumns(): PColumnIdAndSpec[] {
    const columns = JSON.parse(this.#frame.listColumns()) as Record<string, PColumnIdAndSpec>;
    return Object.values(columns);
  }

  /**
   * Discovers the columns that are compatible with a given axes integration.
   *
   * The include filters and the exclude filters apply in order. The exclude filters
   * remove matches from the include set. Each hit has its own traversal `path`. To
   * materialize a hit as a `SpecQueryJoinEntry`, give the hit's column id and `path`
   * to {@link buildQuery}.
   */
  discoverColumns(
    request: PFrameInternal.DiscoverColumnsRequestV2,
  ): PFrameInternal.DiscoverColumnsResponse {
    return JSON.parse(this.#frame.discoverColumns(JSON.stringify(request)));
  }

  /** Finds the columns in this frame that match the given filter criteria. */
  findColumns(request: PFrameInternal.FindColumnsRequest): PFrameInternal.FindColumnsResponse {
    return JSON.parse(this.#frame.findColumns(JSON.stringify(request)));
  }

  /** Resolves a query against this frame's specs. Returns a table spec and a data query. */
  evaluateQuery(request: SpecQuery): EvaluateQueryResponse {
    return JSON.parse(this.#frame.evaluateQuery(JSON.stringify(request)));
  }

  /** Upgrades a {@link LegacyQuery} to the current `SpecQuery` format. */
  rewriteLegacyQuery(request: LegacyQuery): SpecQuery {
    const src = joinEntryToInternal(request.src);
    return JSON.parse(this.#frame.rewriteLegacyQuery(JSON.stringify({ ...request, src })));
  }

  [Symbol.dispose](): void {
    this.#frame[Symbol.dispose]();
  }
}

function joinEntryToInternal(entry: JoinEntry<PObjectId>): PFrameInternal.JoinEntryV4 {
  const type = entry.type;
  switch (type) {
    case "column":
      return {
        type: "column",
        columnId: entry.column,
      };
    case "slicedColumn":
      return {
        type: "slicedColumn",
        columnId: entry.column,
        newId: entry.newId,
        axisFilters: entry.axisFilters,
      };
    case "artificialColumn":
      return {
        type: "artificialColumn",
        columnId: entry.column,
        newId: entry.newId,
        axesIndices: entry.axesIndices,
      };
    case "inlineColumn":
      return {
        type: "inlineColumn",
        newId: entry.column.id,
        spec: entry.column.spec,
        dataInfo: {
          type: "Json",
          keyLength: entry.column.spec.axesSpec.length,
          data: entry.column.data.reduce(
            (acc, row) => {
              acc[JSON.stringify(row.key)] = row.val;
              return acc;
            },
            {} as Record<string, PColumnValue>,
          ),
        },
      };
    case "inner":
    case "full":
      return {
        type: entry.type,
        entries: entry.entries.map((col) => joinEntryToInternal(col)),
      };
    case "outer":
      return {
        type: "outer",
        primary: joinEntryToInternal(entry.primary),
        secondary: entry.secondary.map((col) => joinEntryToInternal(col)),
      };
    default:
      throw new Error(`unsupported PFrame join entry type: ${type satisfies never}`);
  }
}
