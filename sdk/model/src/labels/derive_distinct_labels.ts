import {
  Annotation,
  parseJson,
  readAnnotation,
  type AxisQualification,
  type MatchQualifications,
  type PColumnSpec,
  type PObjectId,
  type PObjectSpec,
  type StringifiedJson,
  type Trace,
} from "@milaboratories/pl-model-common";
import { throwError } from "@milaboratories/helpers";
import { isFunction, isNil } from "es-toolkit";
import { derivePostfixes, type LinkerFormatter } from "./linked_column_postfix";

export type { Trace, TraceEntry } from "@milaboratories/pl-model-common";

const DISTANCE_PENALTY = 0.001;
const LABEL_TYPE = "__LABEL__";
const LABEL_TYPE_FULL = "__LABEL__@1";
const HIT_QUAL_TYPE = "__HIT_QUAL__";
const ANCHOR_QUAL_TYPE_PREFIX = "__ANCHOR_QUAL__:";

function isAnchorQualType(t: string): boolean {
  return t.startsWith(ANCHOR_QUAL_TYPE_PREFIX);
}

function isSyntheticType(t: string): boolean {
  return t === HIT_QUAL_TYPE || isAnchorQualType(t);
}

/** SDK-internal trace shape — adds fields used by this algorithm only, not part of the on-disk contract. */
type ExtendedTraceEntry = Trace[number] & {
  importance?: number;
  position?: "prefix" | "suffix";
};

export type LinkerStep = {
  /** Linker column spec — its `axesSpec` yields the source axis (root); its `LinkLabel`/`Label` names it. */
  spec: PColumnSpec;
  /** Axis qualifications applied on this hop. Not yet consumed by the postfix (deferred). */
  qualifications?: AxisQualification[];
};

export type Entry =
  | PObjectSpec
  | {
      spec: PObjectSpec;
      /** Extra trace entries merged with the base trace from annotations. */
      extraTrace?: ExtendedTraceEntry[];
      /** Linker steps (`[0]` source-most) traversed to reach this column; rendered as a "via …"
       *  postfix only when needed for uniqueness — see {@link derivePostfixes}. */
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
  /** Linker/source postfix zone (phase 2). Receives the distinguishing tokens (`{ root, linkers }`)
   *  and returns the "via …" text, or `undefined` to suppress. */
  linker?: LinkerFormatter;
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

/**
 * Distinct labels for a set of columns. Two phases:
 *  1. {@link deriveStems} — treats each column as a single entity (native label + trace + hit/anchor
 *     qualifications) and produces the minimal distinguishing "stem".
 *  2. {@link derivePostfixes} — for columns still colliding on their stem, appends a "via …" postfix
 *     describing the difference between their linker sources (root axis, then linker chain).
 */
export function deriveDistinctLabels(values: Entry[], options: DeriveLabelsOptions = {}): string[] {
  const stems = deriveStems(values, options);
  return derivePostfixes(
    values.map((v, i) => {
      const { spec, linkerPath } = extractEntryParts(v);
      return {
        stem: stems[i],
        // Hit columns are PColumns; the postfix reads their axesSpec to orient linkers.
        hit: spec as PColumnSpec,
        linkers: (linkerPath ?? []).map((s) => s.spec),
      };
    }),
    options.formatters?.linker,
  );
}

/** Phase 1: minimal per-column stem — native label + trace + hit/anchor qualifications, no linkers. */
function deriveStems(values: Entry[], options: DeriveLabelsOptions): string[] {
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

  const forcedSet = new Set<string>();
  if (labelForced) forcedSet.add(LABEL_TYPE_FULL);

  const { mainTypes, secondaryTypes } = classifyTypes(stats, values.length);

  const build = (typeSet: Set<string>, force: boolean) =>
    buildLabels(records, typeSet, forceTraceElements, separator, force);
  const finalize = (minimized: Set<string>, rendered: string[]) =>
    repairBareLabels(rendered, minimized, records, stats, forceTraceElements, separator);

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
      return finalize(
        minimized,
        build(minimized, false) ?? throwError("Failed to derive unique labels"),
      );
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
  return finalize(
    minimized,
    build(minimized, true) ?? throwError("Failed to derive unique labels"),
  );
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
  const { spec, extraTrace, qualifications } = extractEntryParts(value);
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

  if (qualifications !== undefined && qualifications.forQueries !== undefined) {
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
    if (qualifications.forHit !== undefined && qualifications.forHit.length > 0) {
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

function renderRecordLabel(
  record: EnrichedRecord,
  includedTypes: Set<string>,
  forceTraceElements: Set<string> | undefined,
  separator: string,
): string | undefined {
  const traceParts: string[] = [];
  const anchorParts: string[] = [];
  let hitLabel: string | undefined;

  for (const ft of record.fullTrace) {
    if (!(includedTypes.has(ft.fullType) || forceTraceElements?.has(ft.type))) continue;
    if (ft.type === HIT_QUAL_TYPE) hitLabel = ft.label;
    else if (isAnchorQualType(ft.type)) anchorParts.push(ft.label);
    else traceParts.push(ft.label);
  }

  const isEmpty = traceParts.length === 0 && anchorParts.length === 0 && hitLabel === undefined;

  if (isEmpty) return undefined;

  let label = traceParts.join(separator);
  const append = (part: string) => {
    label = label.length === 0 ? part : `${label} ${part}`;
  };
  for (const a of anchorParts) append(a);
  if (hitLabel !== undefined) append(hitLabel);

  return label;
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
    const rendered = renderRecordLabel(r, includedTypes, forceTraceElements, separator);
    if (rendered === undefined) {
      if (!force) return undefined;
      result.push("Unlabeled");
      continue;
    }
    result.push(rendered);
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

/**
 * Repairs labels told apart only by what they lack: in a group with the same shown base, a
 * member is bare when its shown parts are a strict subset of a peer's. The group is re-labelled
 * from parts all members carry, or bare members add a hidden part (group-wide when labels stay
 * unique), whichever keeps the more important distinction; labels stay unique across the list.
 */
function repairBareLabels(
  labels: string[],
  minimized: Set<string>,
  records: EnrichedRecord[],
  stats: TypeStats,
  forceTraceElements: Set<string> | undefined,
  separator: string,
): string[] {
  const traces = records.map((r) => new Map(r.fullTrace.map((ft) => [ft.fullType, ft.label])));
  const isQualification = (t: string) => isSyntheticType(t.split("@")[0]);
  // Trace steps from the end of each column's trace, used to match parts of the same kind; the
  // native label and qualification tags are not steps, so they don't shift the count.
  const depths = records.map((r) => {
    const steps = r.fullTrace.filter(
      (ft) => ft.fullType !== LABEL_TYPE_FULL && !isQualification(ft.fullType),
    );
    return new Map(steps.map((ft, idx) => [ft.fullType, steps.length - idx]));
  });
  const isForced = (t: string) => forceTraceElements?.has(t.split("@")[0]) === true;
  const isDistinctionType = (t: string) => t !== LABEL_TYPE_FULL && !isQualification(t);
  const importance = (t: string) => stats.importances.get(t) ?? 0;
  const byImportance = (a: string, b: string) => importance(b) - importance(a);
  const render = (i: number, types: Set<string>) =>
    renderRecordLabel(records[i], types, forceTraceElements, separator);
  const partKey = (t: string, l: string | undefined) => `${t}\u0000${l}`;

  const labelShown = minimized.has(LABEL_TYPE_FULL);
  const baseTypes = new Set<string>(labelShown ? [LABEL_TYPE_FULL] : []);
  const qualTypes = [...minimized].filter(isQualification);

  // Group by the shown base; columns without one share a group and only get the bare fix.
  const groups = new Map<string, number[]>();
  records.forEach((_, i) => {
    const key = render(i, baseTypes) ?? "";
    const group = groups.get(key);
    if (group) group.push(i);
    else groups.set(key, [i]);
  });

  const patched = [...labels];
  const counts = new Map<string, number>();
  const addCount = (l: string, d: number) => counts.set(l, (counts.get(l) ?? 0) + d);
  for (const l of patched) addCount(l, 1);

  // Applies new labels to some columns unless one clashes with a label elsewhere.
  const tryApply = (members: number[], next: string[]): boolean => {
    if (new Set(next).size !== members.length) return false;
    for (const i of members) addCount(patched[i], -1);
    const clashes = next.some((l) => (counts.get(l) ?? 0) > 0);
    members.forEach((i, k) => {
      if (!clashes) patched[i] = next[k];
      addCount(patched[i], 1);
    });
    return !clashes;
  };

  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const shown = group.map((i) =>
      [...traces[i]].filter(([t]) => t !== LABEL_TYPE_FULL && (minimized.has(t) || isForced(t))),
    );
    const partKeys = shown.map((parts) => parts.map(([t, l]) => partKey(t, l)));
    const keySets = partKeys.map((keys) => new Set(keys));
    const postings = new Map<string, number[]>();
    partKeys.forEach((keys, k) =>
      keys.forEach((p) => {
        const list = postings.get(p);
        if (list) list.push(k);
        else postings.set(p, [k]);
      }),
    );
    // Supersets: peers showing all of a member's parts and more (non-empty means bare). Peers
    // come from the posting list of its rarest part, which keeps typical groups linear.
    const withParts = group.map((_, m) => m).filter((m) => partKeys[m].length > 0);
    const supersetsOf = (k: number) => {
      const keys = partKeys[k];
      if (keys.length === 0) return withParts;
      const rarest = keys.reduce((a, b) =>
        postings.get(a)!.length <= postings.get(b)!.length ? a : b,
      );
      return postings
        .get(rarest)!
        .filter(
          (m) => m !== k && keySets[m].size > keys.length && keys.every((x) => keySets[m].has(x)),
        );
    };
    const supersets = group.map((_, k) => supersetsOf(k));
    const bare = supersets.map((peers) => peers.length > 0);
    if (!bare.some(Boolean)) continue;

    const typeCount = new Map<string, number>();
    for (const i of group)
      for (const t of traces[i].keys()) typeCount.set(t, (typeCount.get(t) ?? 0) + 1);
    const isUneven = (t: string) => (typeCount.get(t) ?? 0) > 0 && typeCount.get(t)! < group.length;
    const unevenMax = Math.max(
      ...[...minimized]
        .filter((t) => isDistinctionType(t) && !isForced(t) && isUneven(t))
        .map(importance),
    );

    // Shared re-labelling, only when the base is a shown label so its text identifies the group.
    // Parts are chosen without tags, so tags alone never stand in for a shared distinction.
    let sharedLabels: string[] | undefined;
    let sharedMax = Number.NEGATIVE_INFINITY;
    if (labelShown && key !== "") {
      const shared = [...typeCount]
        .filter(([t, n]) => n === group.length && isDistinctionType(t))
        .map(([t]) => t)
        .sort(byImportance);
      const chosen = new Set(baseTypes);
      const distinctCount = (types: Set<string>) =>
        new Set(group.map((i) => render(i, types) ?? "")).size;
      let count = distinctCount(chosen);
      for (const t of shared) {
        if (count === group.length) break;
        const next = distinctCount(new Set([...chosen, t]));
        if (next > count) {
          if (chosen.size === baseTypes.size) sharedMax = importance(t);
          chosen.add(t);
          count = next;
        }
      }
      const withTags = new Set([...chosen, ...qualTypes]);
      const rendered = group.map((i) => render(i, withTags));
      const complete = rendered.filter((l): l is string => l !== undefined);
      if (
        count === group.length &&
        complete.length === group.length &&
        new Set(complete).size === group.length
      )
        sharedLabels = complete;
    }

    // Bare fix: each bare member picks a hidden part that differs from at least one peer making it
    // bare, preferring the trace step those peers show extra, then importance.
    const applyBareFix = (): boolean => {
      const bareMembers = group.filter((_, k) => bare[k]);
      const oldBare = new Map<string, number>();
      for (const i of bareMembers) oldBare.set(patched[i], (oldBare.get(patched[i]) ?? 0) + 1);
      const isFree = (l: string) => (counts.get(l) ?? 0) - (oldBare.get(l) ?? 0) === 0;
      const shownTypes = (k: number) => [...baseTypes, ...shown[k].map(([t]) => t), ...qualTypes];

      const picks = new Map<number, { type: string; label: string }>();
      group.forEach((i, k) => {
        if (!bare[k]) return;
        const extraDepths = new Set(
          supersets[k].flatMap((m) =>
            shown[m]
              .filter(([t, l]) => !isQualification(t) && !keySets[k].has(partKey(t, l)))
              .map(([t]) => depths[group[m]].get(t)),
          ),
        );
        const sameKind = (u: string) => (extraDepths.has(depths[i].get(u)) ? 1 : 0);
        const candidates = [...traces[i].keys()]
          .filter((u) => u !== LABEL_TYPE_FULL && !minimized.has(u) && !isForced(u))
          .filter((u) => supersets[k].some((m) => traces[group[m]].get(u) !== traces[i].get(u)))
          .sort((a, b) => sameKind(b) - sameKind(a) || byImportance(a, b));
        for (const u of candidates) {
          const label = render(i, new Set([...shownTypes(k), u]));
          if (label !== undefined && isFree(label)) {
            picks.set(i, { type: u, label });
            break;
          }
        }
      });
      if (picks.size === 0) return false;

      // Consistent first: every member shows the picked part types it carries. Only within a
      // shown-label group; without one the group spans unrelated columns.
      if (labelShown && key !== "") {
        const picked = [...new Set([...picks.values()].map((p) => p.type))];
        const consistent = group.map((i, k) => render(i, new Set([...shownTypes(k), ...picked])));
        const full = consistent.filter((l): l is string => l !== undefined);
        if (full.length === group.length && tryApply(group, full)) return true;
      }

      // Otherwise only bare members change. They may share a new label only if they shared the old
      // one, and none may take the old label of a bare member that keeps it; repeat until stable.
      const proposed = new Map([...picks].map(([i, p]) => [i, p.label]));
      for (let changed = true; changed; ) {
        changed = false;
        const firstOld = new Map<string, string>();
        for (const [i, l] of proposed) {
          const old = firstOld.get(l);
          if (old === undefined) firstOld.set(l, patched[i]);
          else if (old !== patched[i]) changed = proposed.delete(i);
        }
        const kept = new Set(bareMembers.filter((i) => !proposed.has(i)).map((i) => patched[i]));
        for (const [i, l] of proposed) if (kept.has(l)) changed = proposed.delete(i);
      }
      for (const i of bareMembers) addCount(patched[i], -1);
      for (const i of bareMembers) {
        patched[i] = proposed.get(i) ?? patched[i];
        addCount(patched[i], 1);
      }
      return proposed.size > 0;
    };

    if (sharedLabels && sharedMax >= unevenMax && tryApply(group, sharedLabels)) continue;
    if (applyBareFix()) continue;
    if (sharedLabels && sharedMax < unevenMax) tryApply(group, sharedLabels);
  }

  return patched;
}
