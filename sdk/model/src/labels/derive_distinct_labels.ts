import {
  Annotation,
  parseJson,
  readAnnotation,
  type AxisQualification,
  type PObjectId,
  type PObjectSpec,
  type StringifiedJson,
  type Trace,
} from "@milaboratories/pl-model-common";
import { throwError } from "@milaboratories/helpers";
import { isFunction, isNil } from "es-toolkit";
import type { MatchQualifications } from "../columns/column_collection_builder";

export type { Trace, TraceEntry } from "@milaboratories/pl-model-common";

const DISTANCE_PENALTY = 0.001;
const LABEL_TYPE = "__LABEL__";
const LABEL_TYPE_FULL = "__LABEL__@1";
const LINKER_TYPE = "__LINKER__";
const LINKER_TYPE_FULL = "__LINKER__@1";
const HIT_QUAL_TYPE = "__HIT_QUAL__";
const ANCHOR_QUAL_TYPE_PREFIX = "__ANCHOR_QUAL__:";

function isAnchorQualType(t: string): boolean {
  return t.startsWith(ANCHOR_QUAL_TYPE_PREFIX);
}

function isSyntheticType(t: string): boolean {
  return t === LINKER_TYPE || t === HIT_QUAL_TYPE || isAnchorQualType(t);
}

/** SDK-internal trace shape — adds fields used by this algorithm only, not part of the on-disk contract. */
type ExtendedTraceEntry = Trace[number] & {
  importance?: number;
  position?: "prefix" | "suffix";
};

export type LinkerStep = {
  spec: PObjectSpec;
  qualifications?: AxisQualification[];
};

export type Entry =
  | PObjectSpec
  | {
      spec: PObjectSpec;
      /** Extra trace entries merged with the base trace from annotations. */
      extraTrace?: ExtendedTraceEntry[];
      /** Linker steps traversed to discover this column; rendered as "via …" only when needed for uniqueness. */
      linkerPath?: LinkerStep[];
      /** Axis qualifications applied to the hit column / already-bound anchors; rendered as "[…]" suffixes. */
      qualifications?: MatchQualifications;
    };

/**
 * Per-zone formatters. Each one receives raw inputs and returns the rendered text for that zone,
 * or `undefined` to suppress the zone entirely (no synthetic injection → no minimization, no render).
 */
export type DeriveLabelsFormatters = {
  /** Native column label. Default: identity. `undefined` → label entry not added (treated as if spec had no label). */
  native?: (label: string, spec: PObjectSpec, index: number) => string | undefined;
  /** Linker zone (whole "via …" piece). Receives step labels with step-quals already inlined.
   *  Default: `via ${steps.join(" > ")}`. */
  linker?: (linkerLabels: string[], spec: PObjectSpec, index: number) => string | undefined;
  /** Per-step linker qualifications inlined into the step base label.
   *  Default: `[${formatQualifications(qs)}]`. `undefined` → step rendered without quals. */
  linkerStepQualification?: (
    qualifications: AxisQualification[],
    stepIndex: number,
    stepSpec: PObjectSpec,
  ) => string | undefined;
  /** Hit-axis qualifications block. Default: `[${formatQualifications(qs)}]`. */
  hitQualification?: (
    qualifications: AxisQualification[],
    spec: PObjectSpec,
    index: number,
  ) => string | undefined;
  /** Per-anchor qualifications block. Default: `[${anchorId}: ${formatQualifications(qs)}]`. */
  anchorQualification?: (
    anchorId: PObjectId,
    qualifications: AxisQualification[],
    spec: PObjectSpec,
    index: number,
  ) => string | undefined;
};

export type DeriveLabelsOptions = {
  /** Separator to use between label parts (" / " by default). */
  separator?: string;
  /** If true, native label is appended at the end of the trace zone. By default it is prepended (label is the most important name). */
  addLabelAsSuffix?: boolean;
  /** Force inclusion of native column label even when not needed for uniqueness. */
  includeNativeLabel?: boolean;
  /** Trace types that must be included in the label. */
  forceTraceElements?: string[];
  /** Per-zone custom formatters. Returning `undefined` from any formatter suppresses the corresponding zone. */
  formatters?: DeriveLabelsFormatters;
};

export function deriveDistinctLabels(values: Entry[], options: DeriveLabelsOptions = {}): string[] {
  const forceTraceElements =
    options.forceTraceElements !== undefined && options.forceTraceElements.length > 0
      ? new Set(options.forceTraceElements)
      : undefined;
  const separator = options.separator ?? " / ";

  const records = values.map((v, i) => enrichRecord(v, i, options));
  const stats = collectTypeStats(records);

  const hasAnySynthetic = records.some((r) => r.fullTrace.some((ft) => isSyntheticType(ft.type)));
  const labelForced =
    (options.includeNativeLabel === true || hasAnySynthetic) &&
    stats.countByType.has(LABEL_TYPE_FULL);
  const linkerForced = stats.countByType.get(LINKER_TYPE_FULL) === values.length;

  const forcedSet = new Set<string>();
  if (labelForced) forcedSet.add(LABEL_TYPE_FULL);
  if (linkerForced) forcedSet.add(LINKER_TYPE_FULL);

  const { mainTypes, secondaryTypes } = classifyTypes(stats, values.length);

  const build = (typeSet: Set<string>, force: boolean) =>
    buildLabels(records, typeSet, forceTraceElements, separator, force);

  if (mainTypes.length === 0) {
    if (secondaryTypes.length !== 0)
      throw new Error("Non-empty secondary types list while main types list is empty.");

    return (
      build(new Set([LABEL_TYPE_FULL]), true) ??
      throwError("Failed to derive labels using native column labels")
    );
  }

  let includedCount = 0;
  let additionalType = -1;
  while (includedCount < mainTypes.length) {
    const currentSet = new Set<string>(forcedSet);
    for (let i = 0; i < includedCount; ++i) currentSet.add(mainTypes[i]);
    if (additionalType >= 0) currentSet.add(mainTypes[additionalType]);

    const candidateResult = build(currentSet, false);
    if (candidateResult !== undefined && countUniqueLabels(candidateResult) === values.length) {
      const minimized = minimizeTypeSet(
        currentSet,
        records,
        stats,
        forceTraceElements,
        forcedSet,
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

  const fallbackSet = new Set([...forcedSet, ...mainTypes, ...secondaryTypes]);
  const minimized = minimizeTypeSet(
    fallbackSet,
    records,
    stats,
    forceTraceElements,
    forcedSet,
    separator,
  );
  return build(minimized, true) ?? throwError("Failed to derive unique labels");
}

// --- Pure helpers ---
type FullTraceEntry = ExtendedTraceEntry & { fullType: string; occurrenceIndex: number };

type EnrichedRecord = {
  fullTrace: FullTraceEntry[];
};

function extractEntryParts(entry: Entry): {
  spec: PObjectSpec;
  extraTrace: ExtendedTraceEntry[] | undefined;
  linkerPath: LinkerStep[] | undefined;
  qualifications: MatchQualifications | undefined;
} {
  const isEnriched = "spec" in entry && typeof entry.spec === "object";
  if (!isEnriched) {
    return {
      spec: entry as PObjectSpec,
      extraTrace: undefined,
      linkerPath: undefined,
      qualifications: undefined,
    };
  }
  return {
    spec: entry.spec,
    extraTrace: entry.extraTrace,
    linkerPath: entry.linkerPath,
    qualifications: entry.qualifications,
  };
}

function formatQualification(q: AxisQualification): string {
  const ctx = q.contextDomain ?? {};
  const keys = Object.keys(ctx);
  if (keys.length === 0) return q.axis.name;
  const pairs = keys.map((k) => `${k}=${ctx[k]}`).join(", ");
  return Object.prototype.hasOwnProperty.call(ctx, q.axis.name) ? pairs : `${q.axis.name} ${pairs}`;
}

function formatQualifications(qs: AxisQualification[]): string {
  return qs.map(formatQualification).join("; ");
}

function computeStepLabel(
  step: LinkerStep,
  stepIndex: number,
  formatters: DeriveLabelsFormatters | undefined,
): string | undefined {
  const base = (
    readAnnotation(step.spec, Annotation.LinkLabel) ?? readAnnotation(step.spec, Annotation.Label)
  )?.trim();
  if (isNil(base) || base.length === 0) return undefined;
  if (step.qualifications === undefined || step.qualifications.length === 0) return base;
  const qualText = isFunction(formatters?.linkerStepQualification)
    ? formatters.linkerStepQualification(step.qualifications, stepIndex, step.spec)
    : `[${formatQualifications(step.qualifications)}]`;
  return isNil(qualText) ? base : `${base} ${qualText}`;
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

function enrichRecord(value: Entry, index: number, options: DeriveLabelsOptions): EnrichedRecord {
  const { spec, extraTrace, linkerPath, qualifications } = extractEntryParts(value);
  const formatters = options.formatters;

  const rawLabel = readAnnotation(spec, Annotation.Label);
  const traceStr = readAnnotation(spec, Annotation.Trace);
  const baseTrace = traceStr
    ? (parseJson(traceStr as StringifiedJson<ExtendedTraceEntry[]>) ?? [])
    : [];
  const prefixExtra = extraTrace?.filter((e) => e.position === "prefix") ?? [];
  const suffixExtra = extraTrace?.filter((e) => e.position !== "prefix") ?? [];
  const trace: ExtendedTraceEntry[] = [...prefixExtra, ...baseTrace, ...suffixExtra];

  if (!isNil(rawLabel)) {
    const label = isFunction(formatters?.native)
      ? formatters.native(rawLabel, spec, index)
      : rawLabel;
    if (!isNil(label)) {
      const labelEntry = { label, type: LABEL_TYPE, importance: -2 };
      if (options.addLabelAsSuffix === true) trace.push(labelEntry);
      else trace.splice(0, 0, labelEntry);
    }
  }

  if (linkerPath !== undefined && linkerPath.length > 0) {
    const stepLabels = linkerPath
      .map((step, i) => computeStepLabel(step, i, formatters))
      .filter((s): s is string => !isNil(s));
    if (stepLabels.length > 0) {
      const linkerText = isFunction(formatters?.linker)
        ? formatters.linker(stepLabels, spec, index)
        : `via ${stepLabels.join(" > ")}`;
      if (!isNil(linkerText)) {
        trace.push({ type: LINKER_TYPE, label: linkerText, importance: -10 });
      }
    }
  }

  if (qualifications !== undefined) {
    for (const [anchorId, qs] of Object.entries(qualifications.forQueries)) {
      if (qs.length === 0) continue;
      const anchorText = isFunction(formatters?.anchorQualification)
        ? formatters.anchorQualification(anchorId as PObjectId, qs, spec, index)
        : `[${anchorId}: ${formatQualifications(qs)}]`;
      if (isNil(anchorText)) continue;
      trace.push({
        type: `${ANCHOR_QUAL_TYPE_PREFIX}${anchorId}`,
        label: anchorText,
        importance: -11,
      });
    }
    if (qualifications.forHit.length > 0) {
      const hitText = isFunction(formatters?.hitQualification)
        ? formatters.hitQualification(qualifications.forHit, spec, index)
        : `[${formatQualifications(qualifications.forHit)}]`;
      if (!isNil(hitText)) {
        trace.push({ type: HIT_QUAL_TYPE, label: hitText, importance: -12 });
      }
    }
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
    const traceParts: string[] = [];
    const anchorParts: string[] = [];
    let linkerLabel: string | undefined;
    let hitLabel: string | undefined;

    for (const ft of r.fullTrace) {
      if (!(includedTypes.has(ft.fullType) || forceTraceElements?.has(ft.type))) continue;
      if (ft.type === LINKER_TYPE) linkerLabel = ft.label;
      else if (ft.type === HIT_QUAL_TYPE) hitLabel = ft.label;
      else if (isAnchorQualType(ft.type)) anchorParts.push(ft.label);
      else traceParts.push(ft.label);
    }

    const isEmpty =
      traceParts.length === 0 &&
      anchorParts.length === 0 &&
      linkerLabel === undefined &&
      hitLabel === undefined;

    if (isEmpty) {
      if (!force) return undefined;
      result.push("Unlabeled");
      continue;
    }

    let label = traceParts.join(separator);
    const append = (part: string) => {
      label = label.length === 0 ? part : `${label} ${part}`;
    };
    if (linkerLabel !== undefined) append(linkerLabel);
    for (const a of anchorParts) append(a);
    if (hitLabel !== undefined) append(hitLabel);

    result.push(label);
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
  forcedSet: Set<string>,
  separator: string,
): Set<string> {
  const initialResult = buildLabels(records, typeSet, forceTraceElements, separator, false);
  if (initialResult === undefined) return typeSet;

  const targetCardinality = countUniqueLabels(initialResult);
  const result = new Set(typeSet);

  const removable = [...result]
    .filter((t) => !forceTraceElements?.has(t.split("@")[0]) && !forcedSet.has(t))
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
