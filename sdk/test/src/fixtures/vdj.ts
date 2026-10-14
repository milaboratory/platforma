/*
  Bulk VDJ dataset as MiXCR publishes it: the anchor abundance on [sampleId, clonotypeKey],
  partitioned by sample (the shape downstream anonymize steps need), and the CDR3 and label
  columns keyed on the clonotype axis alone via `parentAxes`.
*/

import { ANCHOR_ANNOTATIONS, anchoredColumnId } from "./dataset";
import type { SequenceRow, SyntheticDataset } from "./dataset";
import { renderTsv, xsvImportSpec } from "./xsv-spec";
import type { XsvColumn } from "./xsv-spec";

export const CLONOTYPE_AXIS = {
  name: "pl7.app/vdj/clonotypeKey",
  type: "String" as const,
  domain: { "pl7.app/vdj/clonotypingRunId": "xsv-fixture" },
  annotations: { "pl7.app/label": "Clonotype key" },
};

export const VDJ_CDR3_DOMAIN = { "pl7.app/alphabet": "aminoacid", "pl7.app/vdj/feature": "CDR3" };

/** Anchored id of the CDR3 column, as a consumer's `sequenceOptions` reports it. */
export const VDJ_CDR3_ID = anchoredColumnId("pl7.app/vdj/sequence", VDJ_CDR3_DOMAIN);

export type VdjDatasetOptions = {
  /** Mark these keys with a `pl7.app/isSubset` column; unmarked rows are absent from it. */
  subset?: { members: string[]; label?: string };
};

export function vdjDataset(rows: SequenceRow[], opts: VdjDatasetOptions = {}): SyntheticDataset {
  const columns: XsvColumn[] = [
    {
      column: "cellCount",
      spec: {
        name: "pl7.app/vdj/uniqueCellCount",
        valueType: "Long",
        annotations: ANCHOR_ANNOTATIONS,
      },
    },
    {
      column: "cdr3aa",
      spec: {
        name: "pl7.app/vdj/sequence",
        valueType: "String",
        parentAxes: [1],
        domain: VDJ_CDR3_DOMAIN,
        annotations: { "pl7.app/label": "CDR3 aa" },
      },
    },
    {
      column: "label",
      spec: {
        name: "pl7.app/label",
        valueType: "String",
        parentAxes: [1],
        annotations: { "pl7.app/label": "Clonotype label" },
      },
    },
  ];
  const header = ["sampleId", "clonotypeKey", "cellCount", "cdr3aa", "label"];
  if (opts.subset !== undefined) {
    columns.push({
      column: "tag",
      // A subset column's members are the keys it has rows for, so unmarked rows are
      // skipped rather than imported as NA.
      filterOutRegex: "^$",
      spec: {
        name: "pl7.app/vdj/subset",
        valueType: "Int",
        parentAxes: [1],
        annotations: {
          "pl7.app/label": opts.subset.label ?? "Picked",
          "pl7.app/isSubset": "true",
        },
      },
    });
    header.push("tag");
  }
  const members = new Set(opts.subset?.members ?? []);
  const content = renderTsv(
    header,
    rows.map((r) => ({
      sampleId: r.sample ?? "S1",
      clonotypeKey: r.key,
      cellCount: r.count,
      cdr3aa: r.seq,
      label: r.label ?? r.key,
      tag: members.has(r.key) ? 1 : undefined,
    })),
  );
  return {
    spec: xsvImportSpec({
      axes: [
        { column: "sampleId", spec: { name: "pl7.app/sampleId", type: "String" } },
        { column: "clonotypeKey", spec: CLONOTYPE_AXIS },
      ],
      columns,
      partitionKeyLength: 1,
    }),
    content,
    anchorColumn: "cellCount",
    sequenceId: VDJ_CDR3_ID,
    filterColumn: opts.subset === undefined ? undefined : "tag",
  };
}
