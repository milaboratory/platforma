import type {
  AxisId,
  PColumnIdAndSpec,
  PObjectId,
  PFrameHandle,
  PTableDef,
  PTableHandle,
  QueryData,
} from "@platforma-sdk/model";
import { hashJson } from "@milaboratories/pl-model-middle-layer";

export type FullPTableDefV1 = {
  type: 'v1';
  pFrameHandle: PFrameHandle;
  def: PTableDef<PObjectId>;
};

export type FullPTableDefV2 = {
  type: 'v2';
  pFrameHandle: PFrameHandle;
  request: {
    tableSpec: {
      axes: AxisId[];
      columns: PColumnIdAndSpec[];
    };
    dataQuery: QueryData;
  };
};

export type FullPTableDef = FullPTableDefV1 | FullPTableDefV2;

export function stableKeyFromFullPTableDef(data: FullPTableDef): PTableHandle {
  return hashJson(data) as string as PTableHandle;
}
