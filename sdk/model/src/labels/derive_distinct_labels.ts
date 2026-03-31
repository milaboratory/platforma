import {
  Annotation,
  parseJson,
  readAnnotation,
  type CanonicalizedJson,
  type PObjectSpec,
} from "@milaboratories/pl-model-common";
import { throwError } from "@milaboratories/helpers";

const DISTANCE_PENALTY = 0.001;
const LABEL_TYPE = "__LABEL__";
const LABEL_TYPE_FULL = "__LABEL__@1";

export type WithLabel<T> = {
  value: T;
  label: string;
};

type TraceEntry = {
  id?: string;
  type: string;
  label: string;
  importance?: number;
};

export type Trace = TraceEntry[];

export type Entry =
  | PObjectSpec
  | { spec: PObjectSpec; prefixTrace?: TraceEntry[]; suffixTrace?: TraceEntry[] };

export type DeriveLabelsOptions = {
  /** Separator to use between label parts (" / " by default) */
  separator?: string;
  /** If true, label will be added as suffix (at the end of the generated label). By default label added as a prefix. */
  addLabelAsSuffix?: boolean;
  /** Force inclusion of native column label */
  includeNativeLabel?: boolean;
  /** Trace elements list that will be forced to be included in the label. */
  forceTraceElements?: string[];
};

export function deriveDistinctLabels<T extends Entry>(
  values: T[],
  options: DeriveLabelsOptions = {},
): WithLabel<T>[] {
  const forceTraceElements =
    options.forceTraceElements !== undefined && options.forceTraceElements.length > 0
      ? new Set(options.forceTraceElements)
      : undefined;
  const separator = options.separator ?? " / ";

  // Phase 1: enrich each value with parsed trace
  const records = values.map((v) => enrichRecord(v, options));

  // Phase 2: collect global type statistics
  const stats = collectTypeStats(records);

  // Phase 3: classify types into main (present everywhere) and secondary
  const { mainTypes, secondaryTypes } = classifyTypes(stats, values.length);

  const build = (typeSet: Set<string>, force: boolean) =>
    buildLabels(records, typeSet, forceTraceElements, separator, force);

  if (mainTypes.length === 0) {
    if (secondaryTypes.length !== 0)
      throw new Error("Non-empty secondary types list while main types list is empty.");
    return build(new Set(LABEL_TYPE_FULL), true)!;
  }

  // Phase 4: search for minimal type set that produces unique labels
  //
  // includedCount = 2
  // *  *
  // T0 T1 T2 T3 T4 T5
  //          *
  // additionalType = 3
  //
  // Resulting set: T0, T1, T3
  //
  let includedCount = 0;
  let additionalType = -1;
  while (includedCount < mainTypes.length) {
    const currentSet = new Set<string>();
    if (options.includeNativeLabel) currentSet.add(LABEL_TYPE_FULL);
    for (let i = 0; i < includedCount; ++i) currentSet.add(mainTypes[i]);
    if (additionalType >= 0) currentSet.add(mainTypes[additionalType]);

    const candidateResult = build(currentSet, false);
    if (candidateResult !== undefined && countUniqueLabels(candidateResult) === values.length) {
      const minimized = minimizeTypeSet(
        currentSet,
        records,
        stats,
        forceTraceElements,
        options,
        separator,
      );
      return build(minimized, false) ?? throwError("Failed to derive unique labels");
    }

    additionalType++;
    if (additionalType >= mainTypes.length) {
      includedCount++;
      additionalType = includedCount;
    }
  }

  // Fallback: include all types, then minimize
  const fallbackSet = new Set([...mainTypes, ...secondaryTypes]);
  const minimized = minimizeTypeSet(
    fallbackSet,
    records,
    stats,
    forceTraceElements,
    options,
    separator,
  );
  return build(minimized, true) ?? throwError("Failed to derive unique labels");
}

// --- Pure helpers ---
type FullTraceEntry = TraceEntry & { fullType: string; occurrenceIndex: number };

type EnrichedRecord<T> = {
  value: T;
  fullTrace: FullTraceEntry[];
};

function extractSpecAndTrace(entry: Entry): {
  spec: PObjectSpec;
  prefixTrace: TraceEntry[] | undefined;
  suffixTrace: TraceEntry[] | undefined;
} {
  if ("spec" in entry && typeof entry.spec === "object") {
    return { spec: entry.spec, prefixTrace: entry.prefixTrace, suffixTrace: entry.suffixTrace };
  }
  return { spec: entry as PObjectSpec, prefixTrace: undefined, suffixTrace: undefined };
}

function buildFullTrace(trace: TraceEntry[]): FullTraceEntry[] {
  const result: FullTraceEntry[] = [];
  const occurrences = new Map<string, number>();

  for (let i = trace.length - 1; i >= 0; --i) {
    const entry = trace[i];
    const occurrenceIndex = (occurrences.get(entry.type) ?? 0) + 1;
    occurrences.set(entry.type, occurrenceIndex);
    result.push({
      ...entry,
      fullType: `${entry.type}@${occurrenceIndex}`,
      occurrenceIndex,
    });
  }

  result.reverse();
  return result;
}

function enrichRecord<T extends Entry>(value: T, options: DeriveLabelsOptions): EnrichedRecord<T> {
  const { spec, prefixTrace, suffixTrace } = extractSpecAndTrace(value);

  const label = readAnnotation(spec, Annotation.Label);
  const traceStr = readAnnotation(spec, Annotation.Trace) as
    | CanonicalizedJson<TraceEntry[]>
    | undefined;
  const baseTrace: Trace = traceStr ? (parseJson<Trace>(traceStr) ?? []) : [];
  const trace = [...(prefixTrace ?? []), ...baseTrace, ...(suffixTrace ?? [])];

  if (label !== undefined) {
    const labelEntry = { label, type: LABEL_TYPE, importance: -2 };
    if (options.addLabelAsSuffix) trace.push(labelEntry);
    else trace.splice(0, 0, labelEntry);
  }

  return { value, fullTrace: buildFullTrace(trace) };
}

type TypeStats = {
  importances: Map<string, number>;
  countByType: Map<string, number>;
};

function collectTypeStats<T>(records: EnrichedRecord<T>[]): TypeStats {
  const importances = new Map<string, number>();
  const countByType = new Map<string, number>();

  for (const record of records) {
    for (let i = 0; i < record.fullTrace.length; i++) {
      const { fullType, importance: rawImportance } = record.fullTrace[i];
      const importance = rawImportance ?? 0;
      const distance = (record.fullTrace.length - i) * DISTANCE_PENALTY;

      countByType.set(fullType, (countByType.get(fullType) ?? 0) + 1);
      importances.set(
        fullType,
        Math.max(importances.get(fullType) ?? Number.NEGATIVE_INFINITY, importance - distance),
      );
    }
  }

  return { importances, countByType };
}

function classifyTypes(
  stats: TypeStats,
  totalRecords: number,
): { mainTypes: string[]; secondaryTypes: string[] } {
  const sorted = [...stats.importances].sort(([, i1], [, i2]) => i2 - i1);

  const mainTypes: string[] = [];
  const secondaryTypes: string[] = [];

  for (const [typeName] of sorted) {
    if (typeName.endsWith("@1") || stats.countByType.get(typeName) === totalRecords)
      mainTypes.push(typeName);
    else secondaryTypes.push(typeName);
  }

  return { mainTypes, secondaryTypes };
}

function buildLabels<T>(
  records: EnrichedRecord<T>[],
  includedTypes: Set<string>,
  forceTraceElements: Set<string> | undefined,
  separator: string,
  force: boolean,
): WithLabel<T>[] | undefined {
  const result: WithLabel<T>[] = [];

  for (const r of records) {
    const parts: string[] = [];
    for (const ft of r.fullTrace) {
      if (includedTypes.has(ft.fullType) || forceTraceElements?.has(ft.type)) {
        parts.push(ft.label);
      }
    }

    if (parts.length === 0) {
      if (!force) return undefined;
      result.push({ label: "Unlabeled", value: r.value });
      continue;
    }

    result.push({ label: parts.join(separator), value: r.value });
  }

  return result;
}

function countUniqueLabels<T>(result: WithLabel<T>[] | undefined): number {
  if (result === undefined) return 0;
  return new Set(result.map((c) => c.label)).size;
}

function minimizeTypeSet<T>(
  typeSet: Set<string>,
  records: EnrichedRecord<T>[],
  stats: TypeStats,
  forceTraceElements: Set<string> | undefined,
  options: DeriveLabelsOptions,
  separator: string,
): Set<string> {
  const initialResult = buildLabels(records, typeSet, forceTraceElements, separator, false);
  if (initialResult === undefined) return typeSet;

  const targetCardinality = countUniqueLabels(initialResult);
  const result = new Set(typeSet);

  const removable = [...result]
    .filter(
      (t) =>
        !forceTraceElements?.has(t.split("@")[0]) &&
        !(options.includeNativeLabel && t === LABEL_TYPE_FULL),
    )
    .sort((a, b) => (stats.importances.get(a) ?? 0) - (stats.importances.get(b) ?? 0));

  for (const typeToRemove of removable) {
    const candidate = new Set(result);
    candidate.delete(typeToRemove);
    const candidateResult = buildLabels(records, candidate, forceTraceElements, separator, false);
    if (candidateResult !== undefined && countUniqueLabels(candidateResult) >= targetCardinality) {
      result.delete(typeToRemove);
    }
  }

  return result;
}
