import type { PUniversalColumnSpec } from "@milaboratories/pl-middle-layer";
import { Annotation } from "@milaboratories/pl-middle-layer";

// Xsv settings: body returns TSV with "key" as axis, "heavyChain" as value column
export const xsvSettings = {
  batchKeyColumns: ["key"],
  columns: [
    {
      column: "heavyChain",
      id: "heavyChain",
      spec: {
        valueType: "String",
        name: "heavyChain",
        annotations: {
          [Annotation.Label]: "Heavy Chain",
        } satisfies Annotation,
      },
    },
  ],
  storageFormat: "Json",
} as const;

export const singleAxisSpec: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "sequence",
  valueType: "String",
  axesSpec: [{ name: "key", type: "String" }],
};

export const twoAxisSpec: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "sequence",
  valueType: "String",
  axesSpec: [
    { name: "sampleId", type: "String" },
    { name: "key", type: "String" },
  ],
};

export const xsvSettingsIsolation = {
  batchKeyColumns: ["key"],
  columns: [
    {
      column: "heavyChain",
      id: "heavyChain",
      spec: {
        valueType: "String",
        name: "heavyChain",
        annotations: {
          [Annotation.Label]: "Heavy Chain",
        } satisfies Annotation,
      },
    },
  ],
  storageFormat: "Json",
} as const;
