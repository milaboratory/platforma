/*
  Peptide dataset as peptide-extraction publishes it: the anchor abundance on
  [sampleId, variantKey], and sequence, label and length keyed on the variant axis.
*/

import { ANCHOR_ANNOTATIONS, anchoredColumnId } from "./dataset";
import type { SequenceRow, SyntheticDataset } from "./dataset";
import { renderTsv, xsvImportSpec } from "./xsv-spec";

export const VARIANT_AXIS = {
  name: "pl7.app/variantKey",
  type: "String" as const,
  domain: { "pl7.app/peptide/extractionRunId": "xsv-fixture" },
  annotations: { "pl7.app/label": "Variant" },
};

export const PEPTIDE_SEQUENCE_DOMAIN = {
  "pl7.app/alphabet": "aminoacid",
  "pl7.app/feature": "peptide",
};

/** Anchored id of the peptide sequence column. */
export const PEPTIDE_SEQUENCE_ID = anchoredColumnId("pl7.app/sequence", PEPTIDE_SEQUENCE_DOMAIN);

export function peptideDataset(rows: SequenceRow[]): SyntheticDataset {
  const header = ["sampleId", "variantKey", "cellCount", "sequence", "label", "length"];
  return {
    spec: xsvImportSpec({
      axes: [
        { column: "sampleId", spec: { name: "pl7.app/sampleId", type: "String" } },
        { column: "variantKey", spec: VARIANT_AXIS },
      ],
      columns: [
        {
          column: "cellCount",
          spec: { name: "pl7.app/abundance", valueType: "Long", annotations: ANCHOR_ANNOTATIONS },
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
    }),
    content: renderTsv(
      header,
      rows.map((r) => ({
        sampleId: r.sample ?? "S1",
        variantKey: r.key,
        cellCount: r.count,
        sequence: r.seq,
        label: r.label ?? r.key,
        length: r.seq.length,
      })),
    ),
    anchorColumn: "cellCount",
    sequenceId: PEPTIDE_SEQUENCE_ID,
  };
}
