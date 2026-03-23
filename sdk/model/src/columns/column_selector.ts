import type {
  AxisValueType,
  ColumnValueType,
  MultiAxisSelector,
  MultiColumnSelector,
  PColumnSpec,
  StringMatcher,
} from "@milaboratories/pl-model-common";

export type { StringMatcher } from "@milaboratories/pl-model-common";

// --- Relaxed types ---

/** Relaxed string matcher input: plain string, single matcher, or array of mixed. */
export type RelaxedStringMatchers = string | StringMatcher | (string | StringMatcher)[];

/** Relaxed record matcher: values can be plain strings or relaxed matchers. */
export type RelaxedRecord = Record<string, RelaxedStringMatchers>;

/** Relaxed axis selector — accepts plain strings where strict requires StringMatcher[]. */
export interface RelaxedAxisSelector {
  name?: RelaxedStringMatchers;
  type?: AxisValueType | AxisValueType[];
  domain?: RelaxedRecord;
  contextDomain?: RelaxedRecord;
  annotations?: RelaxedRecord;
}

/** Relaxed column selector — convenient hand-written form. */
export interface RelaxedColumnSelector {
  name?: RelaxedStringMatchers;
  type?: ColumnValueType | ColumnValueType[];
  domain?: RelaxedRecord;
  contextDomain?: RelaxedRecord;
  annotations?: RelaxedRecord;
  axes?: RelaxedAxisSelector[];
  partialAxesMatch?: boolean;
}

/** Input that normalizes to ColumnSelector[]. */
export type ColumnSelectorInput = RelaxedColumnSelector | RelaxedColumnSelector[];

// --- Normalization ---

function normalizeStringMatchers(input: RelaxedStringMatchers): StringMatcher[] {
  if (typeof input === "string") return [{ type: "regex", value: input }];
  if (!Array.isArray(input)) return [input];
  return input.map((v) =>
    typeof v === "string" ? ({ type: "regex", value: v } satisfies StringMatcher) : v,
  );
}

function normalizeRecord(input: RelaxedRecord): Record<string, StringMatcher[]> {
  const result: Record<string, StringMatcher[]> = {};
  for (const [key, value] of Object.entries(input)) {
    result[key] = normalizeStringMatchers(value);
  }
  return result;
}

function normalizeTypes<T>(input: T | T[]): T[] {
  return Array.isArray(input) ? input : [input];
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function normalizeAxisSelector(input: RelaxedAxisSelector): MultiAxisSelector {
  const result: Mutable<MultiAxisSelector> = {};
  if (input.name !== undefined) result.name = normalizeStringMatchers(input.name);
  if (input.type !== undefined) result.type = normalizeTypes(input.type);
  if (input.domain !== undefined) result.domain = normalizeRecord(input.domain);
  if (input.contextDomain !== undefined)
    result.contextDomain = normalizeRecord(input.contextDomain);
  if (input.annotations !== undefined) result.annotations = normalizeRecord(input.annotations);
  return result;
}

/** Normalize relaxed input to strict ColumnSelector[]. */
export function normalizeSelectors(input: ColumnSelectorInput): MultiColumnSelector[] {
  const arr = Array.isArray(input) ? input : [input];
  return arr.map(normalizeSingleSelector);
}

function normalizeSingleSelector(input: RelaxedColumnSelector): MultiColumnSelector {
  const result: Mutable<MultiColumnSelector> = {};
  if (input.name !== undefined) result.name = normalizeStringMatchers(input.name);
  if (input.type !== undefined) result.type = normalizeTypes(input.type);
  if (input.domain !== undefined) result.domain = normalizeRecord(input.domain);
  if (input.contextDomain !== undefined)
    result.contextDomain = normalizeRecord(input.contextDomain);
  if (input.annotations !== undefined) result.annotations = normalizeRecord(input.annotations);
  if (input.axes !== undefined) result.axes = input.axes.map(normalizeAxisSelector);
  if (input.partialAxesMatch !== undefined) result.partialAxesMatch = input.partialAxesMatch;
  return result;
}

// --- Matching ---

function matchStringValue(value: string, matchers: StringMatcher[]): boolean {
  return matchers.some((m) => {
    if (m.type === "exact") return value === m.value;
    return new RegExp(`^(?:${m.value})$`).test(value);
  });
}

function matchRecordField(
  actual: Record<string, string> | undefined,
  required: Record<string, StringMatcher[]>,
): boolean {
  const record = actual ?? {};
  for (const [key, matchers] of Object.entries(required)) {
    const value = record[key];
    if (value === undefined) return false;
    if (!matchStringValue(value, matchers)) return false;
  }
  return true;
}

/** Get combined domain: column's own domain merged with all axis domains. */
function getCombinedDomain(spec: PColumnSpec): Record<string, string> {
  const result: Record<string, string> = {};
  if (spec.domain) Object.assign(result, spec.domain);
  for (const axis of spec.axesSpec) {
    if (axis.domain) Object.assign(result, axis.domain);
  }
  return result;
}

/** Get combined context domain: column's own contextDomain merged with all axis contextDomains. */
function getCombinedContextDomain(spec: PColumnSpec): Record<string, string> {
  const result: Record<string, string> = {};
  if (spec.contextDomain) Object.assign(result, spec.contextDomain);
  for (const axis of spec.axesSpec) {
    if ("contextDomain" in axis && axis.contextDomain) Object.assign(result, axis.contextDomain);
  }
  return result;
}

function matchAxisSelector(
  axis: PColumnSpec["axesSpec"][number],
  selector: MultiAxisSelector,
): boolean {
  if (selector.name !== undefined && !matchStringValue(axis.name, selector.name)) return false;
  if (selector.type !== undefined && !selector.type.includes(axis.type)) return false;
  if (selector.domain !== undefined && !matchRecordField(axis.domain, selector.domain))
    return false;
  if (
    selector.contextDomain !== undefined &&
    !matchRecordField(
      "contextDomain" in axis ? (axis.contextDomain as Record<string, string>) : undefined,
      selector.contextDomain,
    )
  )
    return false;
  if (
    selector.annotations !== undefined &&
    !matchRecordField(axis.annotations, selector.annotations)
  )
    return false;
  return true;
}

/** Check if a PColumnSpec matches a single strict ColumnSelector. */
export function matchColumn(spec: PColumnSpec, selector: MultiColumnSelector): boolean {
  if (selector.name !== undefined && !matchStringValue(spec.name, selector.name)) return false;
  if (selector.type !== undefined && !selector.type.includes(spec.valueType)) return false;

  if (selector.domain !== undefined) {
    const combined = getCombinedDomain(spec);
    if (!matchRecordField(combined, selector.domain)) return false;
  }

  if (selector.contextDomain !== undefined) {
    const combined = getCombinedContextDomain(spec);
    if (!matchRecordField(combined, selector.contextDomain)) return false;
  }

  if (selector.annotations !== undefined) {
    if (!matchRecordField(spec.annotations, selector.annotations)) return false;
  }

  if (selector.axes !== undefined) {
    const partialMatch = selector.partialAxesMatch ?? true;
    if (partialMatch) {
      for (const axisSel of selector.axes) {
        if (!spec.axesSpec.some((axis) => matchAxisSelector(axis, axisSel))) return false;
      }
    } else {
      if (spec.axesSpec.length !== selector.axes.length) return false;
      for (let i = 0; i < selector.axes.length; i++) {
        if (!matchAxisSelector(spec.axesSpec[i], selector.axes[i])) return false;
      }
    }
  }

  return true;
}

/** Check if a PColumnSpec matches any of the selectors (OR across array). */
export function matchColumnSelectors(selectors: MultiColumnSelector[], spec: PColumnSpec): boolean {
  return selectors.some((sel) => matchColumn(spec, sel));
}

/**
 * Convert selector input to a predicate function.
 * Normalizes relaxed form, then returns a function that OR-matches.
 */
export function columnSelectorsToPredicate(
  input: ColumnSelectorInput,
): (spec: PColumnSpec) => boolean {
  const selectors = normalizeSelectors(input);
  return (spec) => matchColumnSelectors(selectors, spec);
}
