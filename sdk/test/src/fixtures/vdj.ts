/*
  Bulk VDJ dataset as MiXCR publishes it: the anchor abundance on [sampleId, clonotypeKey],
  partitioned by sample (the shape downstream anonymize steps need), and the CDR3 and label
  columns keyed on the clonotype axis alone via `parentAxes`.
*/

import { ANCHOR_ANNOTATIONS, sequenceDataset } from "./dataset";
import type { XsvAxis } from "./xsv-spec";
import type {
  DatasetShape,
  SequenceDatasetOptions,
  SequenceRow,
  SyntheticDataset,
} from "./dataset";

export const CLONOTYPE_AXIS: XsvAxis = {
  column: "clonotypeKey",
  spec: {
    name: "pl7.app/vdj/clonotypeKey",
    type: "String",
    domain: { "pl7.app/vdj/clonotypingRunId": "xsv-fixture" },
    annotations: { "pl7.app/label": "Clonotype key" },
  },
};

export const SAMPLE_AXIS: XsvAxis = {
  column: "sampleId",
  spec: { name: "pl7.app/sampleId", type: "String" },
};

export const VDJ_CDR3_DOMAIN = { "pl7.app/alphabet": "aminoacid", "pl7.app/vdj/feature": "CDR3" };

/** The VDJ shape; spread it to make a variant. */
export function vdjShape(): DatasetShape {
  return {
    axes: [SAMPLE_AXIS, CLONOTYPE_AXIS],
    columns: [
      {
        column: "cellCount",
        spec: {
          name: "pl7.app/vdj/uniqueCellCount",
          valueType: "Long",
          annotations: ANCHOR_ANNOTATIONS,
        },
        role: "anchor",
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
        role: "sequence",
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
    ],
    partitionKeyLength: 1,
  };
}

export function vdjDataset(
  rows: SequenceRow[],
  opts: SequenceDatasetOptions = {},
): SyntheticDataset {
  return sequenceDataset(
    vdjShape(),
    rows,
    (r) => ({
      sampleId: r.sample ?? "S1",
      clonotypeKey: r.key,
      cellCount: r.count,
      cdr3aa: r.seq,
      label: r.label ?? r.key,
    }),
    opts.subset === undefined
      ? opts
      : { ...opts, subset: { name: "pl7.app/vdj/subset", ...opts.subset } },
  );
}

/** Anchored id of the CDR3 column, as a consumer's sequence options report it. */
export const VDJ_CDR3_ID = vdjDataset([]).sequenceId;
