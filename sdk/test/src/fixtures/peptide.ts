/*
  Peptide dataset as peptide-extraction publishes it: the anchor abundance on
  [sampleId, variantKey], and sequence, label and length keyed on the variant axis.
*/

import { ANCHOR_ANNOTATIONS, sequenceDataset } from "./dataset";
import type {
  DatasetShape,
  SequenceDatasetOptions,
  SequenceRow,
  SyntheticDataset,
} from "./dataset";
import { SAMPLE_AXIS } from "./vdj";
import type { XsvAxis } from "./xsv-spec";

export const VARIANT_AXIS: XsvAxis = {
  column: "variantKey",
  spec: {
    name: "pl7.app/variantKey",
    type: "String",
    domain: { "pl7.app/peptide/extractionRunId": "xsv-fixture" },
    annotations: { "pl7.app/label": "Variant" },
  },
};

export const PEPTIDE_SEQUENCE_DOMAIN = {
  "pl7.app/alphabet": "aminoacid",
  "pl7.app/feature": "peptide",
};

/** The peptide shape; spread it to make a variant. */
export function peptideShape(): DatasetShape {
  return {
    axes: [SAMPLE_AXIS, VARIANT_AXIS],
    columns: [
      {
        column: "cellCount",
        spec: { name: "pl7.app/abundance", valueType: "Long", annotations: ANCHOR_ANNOTATIONS },
        role: "anchor",
      },
      {
        column: "sequence",
        spec: {
          name: "pl7.app/sequence",
          valueType: "String",
          parentAxes: [1],
          domain: PEPTIDE_SEQUENCE_DOMAIN,
          annotations: { "pl7.app/label": "Peptide sequence" },
        },
        role: "sequence",
      },
      {
        column: "label",
        spec: {
          name: "pl7.app/label",
          valueType: "String",
          parentAxes: [1],
          annotations: { "pl7.app/label": "Variant label" },
        },
      },
      // Consumers that tune on peptide length read this column's minimum.
      {
        column: "length",
        spec: {
          name: "pl7.app/sequenceLength",
          valueType: "Int",
          parentAxes: [1],
          domain: { "pl7.app/feature": "peptide" },
          annotations: { "pl7.app/label": "Peptide length" },
        },
      },
    ],
    partitionKeyLength: 1,
  };
}

export function peptideDataset(
  rows: SequenceRow[],
  opts: SequenceDatasetOptions = {},
): SyntheticDataset {
  return sequenceDataset(
    peptideShape(),
    rows,
    (r) => ({
      sampleId: r.sample ?? "S1",
      variantKey: r.key,
      cellCount: r.count,
      sequence: r.seq,
      label: r.label ?? r.key,
      length: r.seq.length,
    }),
    opts,
  );
}

/** Anchored id of the peptide sequence column. */
export const PEPTIDE_SEQUENCE_ID = peptideDataset([]).sequenceId;
