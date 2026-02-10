import type {
  PObjectId,
  PFrameHandle,
  PTableDef,
  PTableHandle,
  QueryData,
  PTableColumnSpec,
} from "@platforma-sdk/model";
import { hashJson } from "@milaboratories/pl-model-middle-layer";

export type FullPTableDefV1 = {
  type: "v1";
  pFrameHandle: PFrameHandle;
  def: PTableDef<PObjectId>;
};

export type FullPTableDefV2 = {
  type: "v2";
  pFrameHandle: PFrameHandle;
  def: {
    tableSpec: PTableColumnSpec[];
    dataQuery: QueryData;
  };
};

export type FullPTableDef = FullPTableDefV1 | FullPTableDefV2;

export function stableKeyFromFullPTableDef(data: FullPTableDef): PTableHandle {
  return hashJson(data) as string as PTableHandle;
}
