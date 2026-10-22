import { columnValueLabel, isColumnValueId } from "@platforma-sdk/model";
import type { FunctionalComponent } from "vue";

/**
 * Text shown in place of a selected value missing from its options: one for every such value,
 * or one per value, `undefined` leaving the usual text.
 */
export type MissingValueLabel = string | ((value: unknown) => string | undefined);

/**
 * Tooltip over a selected value missing from its options: one text for every such value, or
 * content per value, `undefined` when there is nothing to tell about it.
 */
export type MissingValueTooltip = string | ((value: unknown) => FunctionalComponent | undefined);

/**
 * The value a column value id picks, as text; `undefined` for any other value. A picked value
 * keeps a readable label while the options that would carry it are not loaded or no longer
 * hold it.
 */
export function pickedValueText(value: unknown): string | undefined {
  return isColumnValueId(value) ? columnValueLabel(value) : undefined;
}

/**
 * Text shown for a selected value missing from the options: the one `label` gives for it, else
 * the picked value of a column value id marked as not available, else a generic one.
 */
export function missingValueText(value: unknown, label: MissingValueLabel | undefined): string {
  const given = typeof label === "function" ? label(value) : label;
  if (given !== undefined) return given;
  const picked = pickedValueText(value);
  return picked === undefined ? "Value not available" : `${picked} — not available`;
}

/** Content of the tooltip `tooltip` gives over a selected value missing from the options. */
export function missingValueTooltip(
  value: unknown,
  tooltip: MissingValueTooltip | undefined,
): FunctionalComponent | undefined {
  if (typeof tooltip === "string") return () => tooltip;
  return tooltip?.(value);
}
