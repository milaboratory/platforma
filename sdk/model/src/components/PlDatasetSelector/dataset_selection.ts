import type { LabeledEnrichmentRefs, Option, PrimaryRef } from "@milaboratories/pl-model-common";

/** Dataset picker entry: user picks {@link primary}, gets {@link enrichments} attached. */
export type DatasetOption = {
  readonly primary: Option;
  readonly filters?: readonly Option[];
  readonly enrichments?: LabeledEnrichmentRefs;
};

/**
 * Picked dataset bundle emitted by `PlDatasetSelector`. Stored opaquely in
 * block data; block authors unbundle inside their args resolver.
 */
export type DatasetSelection = {
  readonly __isDatasetSelection: "v1";
  readonly primary: PrimaryRef;
  readonly enrichments?: LabeledEnrichmentRefs;
};

export function isDatasetSelection(value: unknown): value is DatasetSelection {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __isDatasetSelection?: unknown }).__isDatasetSelection === "v1" &&
    "primary" in value
  );
}

export function createDatasetSelection(
  primary: PrimaryRef,
  enrichments?: LabeledEnrichmentRefs,
): DatasetSelection {
  if (enrichments !== undefined && enrichments.length > 0) {
    return { __isDatasetSelection: "v1", primary, enrichments };
  }
  return { __isDatasetSelection: "v1", primary };
}
