import type { XsvImportSpec } from "./xsv-spec";

/**
 * A table ready to publish through xsv-import, with the handles a consuming block needs to
 * wire itself to it: the anchor column, the anchored id of the sequence column, and an
 * optional subset column.
 */
export type SyntheticDataset = {
  spec: XsvImportSpec;
  content: string;
  /** File column of the anchor abundance, the ref a consumer's `datasetRef` points at. */
  anchorColumn: string;
  /** Anchored id of the sequence column, as a consumer's `sequenceOptions` reports it. */
  sequenceId: string;
  /** File column of the subset column, when the dataset has one. */
  filterColumn?: string;
};

/** One row of a sequence dataset. `sample` defaults to "S1"; `label` to the key. */
export type SequenceRow = {
  key: string;
  seq: string;
  count: number;
  sample?: string;
  label?: string;
};

export const ANCHOR_ANNOTATIONS = {
  "pl7.app/isAnchor": "true",
  "pl7.app/isAbundance": "true",
  "pl7.app/abundance/isPrimary": "true",
  "pl7.app/abundance/normalized": "false",
  "pl7.app/abundance/unit": "cells",
  "pl7.app/label": "Number of Cells",
};

/** The anchored id of `name` with `domain`, keyed on axis 1 of the `main` anchor. */
export function anchoredColumnId(name: string, domain: Record<string, string>): string {
  return JSON.stringify({
    axes: [{ anchor: "main", idx: 1 }],
    domain: Object.fromEntries(Object.entries(domain).sort(([a], [b]) => a.localeCompare(b))),
    name,
  });
}
