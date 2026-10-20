import { columnValueLabel, isColumnValueId } from "@platforma-sdk/model";
import type { FunctionalComponent } from "vue";

/**
 * Why a selected value is missing from its options, as the content of a tooltip over the value;
 * `undefined` when there is nothing to tell about it.
 */
export type MissingValueHint = (value: unknown) => FunctionalComponent | undefined;

/**
 * The value a column value id picks, as text; `undefined` for any other value. A picked value
 * keeps a readable label while the options that would carry it are not loaded or no longer
 * hold it.
 */
export function pickedValueText(value: unknown): string | undefined {
  return isColumnValueId(value) ? columnValueLabel(value) : undefined;
}

/**
 * Text shown for a selected value missing from the options: the caller's label, else the
 * picked value of a column value id marked as not available, else a generic one.
 */
export function missingValueText(value: unknown, label: string | undefined): string {
  if (label !== undefined) return label;
  const picked = pickedValueText(value);
  return picked === undefined ? "Value not available" : `${picked} — not available`;
}
