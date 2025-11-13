import type { PObjectId, PFrameHandle, PTableDef, PTableHandle } from '@platforma-sdk/model';
import { hashJson } from '@milaboratories/pl-model-middle-layer';

export type FullPTableDef = {
  pFrameHandle: PFrameHandle;
  def: PTableDef<PObjectId>;
};

export function stableKeyFromFullPTableDef(data: FullPTableDef): PTableHandle {
  return hashJson(data) as string as PTableHandle;
}
