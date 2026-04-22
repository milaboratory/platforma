import type {
  AxisValueType,
  ColumnValueType,
  MultiAxisSelector,
  MultiColumnSelector,
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
export type ColumnSelector = RelaxedColumnSelector | RelaxedColumnSelector[];

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

export function convertRelaxedAxisSelectorToMultiAxisSelector(
  input: RelaxedAxisSelector,
): MultiAxisSelector {
  const result: Mutable<MultiAxisSelector> = {};
  if (input.name !== undefined) result.name = normalizeStringMatchers(input.name);
  if (input.type !== undefined) result.type = normalizeTypes(input.type);
  if (input.domain !== undefined) result.domain = normalizeRecord(input.domain);
  if (input.contextDomain !== undefined)
    result.contextDomain = normalizeRecord(input.contextDomain);
  if (input.annotations !== undefined) result.annotations = normalizeRecord(input.annotations);
  return result;
}

export function convertRelaxedColumnSelectorToMultiColumnSelector(
  input: RelaxedColumnSelector,
): MultiColumnSelector {
  const result: Mutable<MultiColumnSelector> = {};
  if (input.name !== undefined) result.name = normalizeStringMatchers(input.name);
  if (input.type !== undefined) result.type = normalizeTypes(input.type);
  if (input.domain !== undefined) result.domain = normalizeRecord(input.domain);
  if (input.contextDomain !== undefined)
    result.contextDomain = normalizeRecord(input.contextDomain);
  if (input.annotations !== undefined) result.annotations = normalizeRecord(input.annotations);
  if (input.axes !== undefined)
    result.axes = input.axes.map(convertRelaxedAxisSelectorToMultiAxisSelector);
  if (input.partialAxesMatch !== undefined) result.partialAxesMatch = input.partialAxesMatch;
  return result;
}

export function convertColumnSelectorToMultiColumnSelector(
  input: ColumnSelector,
): MultiColumnSelector[] {
  const arr = Array.isArray(input) ? input : [input];
  return arr.map(convertRelaxedColumnSelectorToMultiColumnSelector);
}
