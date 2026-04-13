import {
  Annotation,
  parseJson,
  readAnnotation,
  type PObjectSpec,
  type StringifiedJson,
  type Trace,
} from "@milaboratories/pl-model-common";
import { throwError } from "@milaboratories/helpers";
import { isFunction, isNil } from "es-toolkit";

export type { Trace, TraceEntry } from "@milaboratories/pl-model-common";

const DISTANCE_PENALTY = 0.001;
const LABEL_TYPE = "__LABEL__";
const LABEL_TYPE_FULL = "__LABEL__@1";

/** SDK-internal trace shape — adds fields used by this algorithm only, not part of the on-disk contract. */
type ExtendedTraceEntry = Trace[number] & {
  importance?: number;
  position?: "prefix" | "suffix";
};

export type Entry =
  | PObjectSpec
  | {
      spec: PObjectSpec;
      /** Extra trace entries merged with the base trace from annotations. */
      extraTrace?: ExtendedTraceEntry[];
      /** Linker steps traversed to discover this column; used to append "via $linkLabel" to derived labels. */
      linkerPath?: { spec: PObjectSpec }[];
    };

export type DeriveLabelsOptions = {
  /** Separator to use between label parts (" / " by default) */
  separator?: string;
  /** If true, label will be added as suffix (at the end of the generated label). By default label added as a prefix. */
  addLabelAsSuffix?: boolean;
  /** Force inclusion of native column label */
  includeNativeLabel?: boolean;
  /** Trace elements list that will be forced to be included in the label. */
  forceTraceElements?: string[];
  /** Custom formatter for linker path suffix. Receives the array of linker labels from the full traversal chain,
   *  the column spec, and the column index.
   *  If returns undefined, no linker suffix is appended. By default labels are joined with " > " and prefixed with "via ". */
  linkerLabelFormatter?: (
    linkerLabels: string[],
    spec: PObjectSpec,
    index: number,
  ) => string | undefined;
};

export function deriveDistinctLabels(values: Entry[], options: DeriveLabelsOptions = {}): string[] {
  const forceTraceElements =
    options.forceTraceElements !== undefined && options.forceTraceElements.length > 0
      ? new Set(options.forceTraceElements)
      : undefined;
  const separator = options.separator ?? " / ";

  // Collect per-entry linker suffixes before disambiguation
  const linkerSuffixes = values.map((v, i) => {
    const spec = "spec" in v && typeof v.spec === "object" ? v.spec : (v as PObjectSpec);
    const linkerLabels = extractLinkerLabels(v);
    if (linkerLabels.length === 0) return undefined;
    return isFunction(options.linkerLabelFormatter)
      ? options.linkerLabelFormatter(linkerLabels, spec, i)
      : `via ${linkerLabels.join(" > ")}`;
  });

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

    return applyLinkerSuffixes(
      build(new Set(LABEL_TYPE_FULL), true) ??
        throwError("Failed to derive labels using native column labels"),
      linkerSuffixes,
    );
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
      return applyLinkerSuffixes(
        build(minimized, false) ?? throwError("Failed to derive unique labels"),
        linkerSuffixes,
      );
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
  return applyLinkerSuffixes(
    build(minimized, true) ?? throwError("Failed to derive unique labels"),
    linkerSuffixes,
  );
}

/** Apply pre-formatted linker suffixes to labels that have them. */
function applyLinkerSuffixes(labels: string[], suffixes: (string | undefined)[]): string[] {
  return labels.map((label, i) => (isNil(suffixes[i]) ? label : `${label} ${suffixes[i]}`));
}

/** Extract linker labels from every step of the linkers path. */
function extractLinkerLabels(entry: Entry): string[] {
  if (!("spec" in entry) || typeof entry.spec !== "object") return [];
  const path = entry.linkerPath;
  if (path === undefined || path.length === 0) return [];
  const labels: string[] = [];
  for (const step of path) {
    const label = (
      readAnnotation(step.spec, Annotation.LinkLabel) ?? readAnnotation(step.spec, Annotation.Label)
    )?.trim();
    if (label !== undefined && label.length > 0) {
      labels.push(label);
    }
  }
  return labels;
}

// --- Pure helpers ---
type FullTraceEntry = ExtendedTraceEntry & { fullType: string; occurrenceIndex: number };

type EnrichedRecord = {
  fullTrace: FullTraceEntry[];
};

function extractSpecAndTrace(entry: Entry): {
  spec: PObjectSpec;
  extraTrace: ExtendedTraceEntry[] | undefined;
  linkerPath: { spec: PObjectSpec }[] | undefined;
} {
  const isEnriched = "spec" in entry && typeof entry.spec === "object";
  return {
    spec: isEnriched ? entry.spec : (entry as PObjectSpec),
    extraTrace: isEnriched ? entry.extraTrace : undefined,
    linkerPath: isEnriched ? entry.linkerPath : undefined,
  };
}

function buildFullTrace(trace: ExtendedTraceEntry[]): FullTraceEntry[] {
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

function enrichRecord(value: Entry, options: DeriveLabelsOptions): EnrichedRecord {
  const { spec, extraTrace } = extractSpecAndTrace(value);

  const label = readAnnotation(spec, Annotation.Label);
  const traceStr = readAnnotation(spec, Annotation.Trace);
  const baseTrace = traceStr
    ? (parseJson(traceStr as StringifiedJson<ExtendedTraceEntry[]>) ?? [])
    : [];
  const prefixExtra = extraTrace?.filter((e) => e.position === "prefix") ?? [];
  const suffixExtra = extraTrace?.filter((e) => e.position !== "prefix") ?? [];
  const trace = [...prefixExtra, ...baseTrace, ...suffixExtra];

  if (label !== undefined) {
    const labelEntry = { label, type: LABEL_TYPE, importance: -2 };
    if (options.addLabelAsSuffix) trace.push(labelEntry);
    else trace.splice(0, 0, labelEntry);
  }

  return { fullTrace: buildFullTrace(trace) };
}

type TypeStats = {
  importances: Map<string, number>;
  countByType: Map<string, number>;
};

function collectTypeStats(records: EnrichedRecord[]): TypeStats {
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

function buildLabels(
  records: EnrichedRecord[],
  includedTypes: Set<string>,
  forceTraceElements: Set<string> | undefined,
  separator: string,
  force: boolean,
): string[] | undefined {
  const result: string[] = [];

  for (const r of records) {
    const parts: string[] = [];
    for (const ft of r.fullTrace) {
      if (includedTypes.has(ft.fullType) || forceTraceElements?.has(ft.type)) {
        parts.push(ft.label);
      }
    }

    if (parts.length === 0) {
      if (!force) return undefined;
      result.push("Unlabeled");
      continue;
    }

    result.push(parts.join(separator));
  }

  return result;
}

function countUniqueLabels(result: string[] | undefined): number {
  if (result === undefined) return 0;
  return new Set(result).size;
}

function minimizeTypeSet(
  typeSet: Set<string>,
  records: EnrichedRecord[],
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
