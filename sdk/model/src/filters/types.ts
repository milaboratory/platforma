import type { PColumnSpec, SUniversalPColumnId } from "@milaboratories/pl-model-common";

export type SimplifiedPColumnSpec = Pick<PColumnSpec, "valueType" | "annotations">;

export type SimplifiedUniversalPColumnEntry = {
  id: SUniversalPColumnId;
  label: string;
  obj: SimplifiedPColumnSpec;
};

export type {
  FilterSpecNode,
  FilterSpecLeaf,
  FilterSpec,
  FilterSpecType,
  FilterSpecOfType,
} from "@milaboratories/pl-model-common";
