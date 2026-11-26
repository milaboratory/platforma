import type { ColumnUniversalId, Option, PrimaryRef } from "@milaboratories/pl-model-common";

/**
 * A column joined to a dataset without being picked by the user, with the header
 * it is exported under. The id names a block output reached from the dataset
 * through linker columns, so a workflow can find the column by the id alone.
 */
export type DatasetEnrichment = {
  readonly id: ColumnUniversalId;
  readonly label: string;
};

/** Dataset picker entry: user picks {@link primary}, gets {@link enrichments} attached. */
export type DatasetOption = {
  readonly primary: Option;
  readonly filters?: readonly Option[];
  readonly enrichments?: readonly DatasetEnrichment[];
};

/**
 * Picked dataset bundle emitted by `PlDatasetSelector`. Stored opaquely in
 * block data; block authors unbundle inside their args resolver.
 */
export type DatasetSelection = {
  readonly __isDatasetSelection: "v1";
  readonly primary: PrimaryRef;
  readonly enrichments?: readonly DatasetEnrichment[];
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
  enrichments?: readonly DatasetEnrichment[],
): DatasetSelection {
  if (enrichments !== undefined && enrichments.length > 0) {
    return { __isDatasetSelection: "v1", primary, enrichments };
  }
  return { __isDatasetSelection: "v1", primary };
}
