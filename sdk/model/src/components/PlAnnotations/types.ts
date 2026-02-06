// @DEPRECATED - use sdk/model/src/filters + sdk/model/src/annotations
import type { PColumnSpec } from "@milaboratories/pl-model-common";

export type SimplifiedPColumnSpec = Pick<PColumnSpec, "valueType" | "annotations">;
