export {
  type Trace,
  type DeriveLabelsOptions as LabelDerivationOps,
  type Entry as SpecExtractorResult,
} from "../../labels/derive_distinct_labels";

// Backward-compatible wrapper: old API accepted a getSpec callback
import {
  deriveDistinctLabels,
  type DeriveLabelsOptions,
  type Entry,
} from "../../labels/derive_distinct_labels";

type WithLabel<T> = { value: T; label: string };

/** @deprecated Use deriveDistinctLabels */
export function deriveLabels<T>(
  values: T[],
  getSpec: (obj: T) => Entry,
  options: DeriveLabelsOptions = {},
): WithLabel<T>[] {
  const specs = values.map(getSpec);
  const labeled = deriveDistinctLabels(specs, options);
  return labeled.map((l, i) => ({ value: values[i], label: l.label }));
}
