import { when } from "@milaboratories/ptabler-expression-js";
import { convertFilterUiToExpressionImpl } from "../filters/converters/filterUiToExpressionImpl";
import type { ExpressionSpec, FilterSpecUi } from "./types";
import { filterEmptyPieces } from "../filters/converters/filterEmpty";

export function convertFilterSpecsToExpressionSpecs(
  annotationsUI: FilterSpecUi[],
): ExpressionSpec[] {
  const validAnnotationsUI = annotationsUI
    .map((step) => ({
      label: step.label,
      filter: filterEmptyPieces(step.filter),
    }))
    .filter(
      (step): step is { label: string; filter: NonNullable<typeof step.filter> } =>
        step.filter !== null,
    );

  return validAnnotationsUI.map(
    (step): ExpressionSpec => ({
      type: "alias",
      name: step.label.trim(),
      value: when(convertFilterUiToExpressionImpl(step.filter))
        .then(true)
        .otherwise(false)
        .toJSON(),
    }),
  );
}
