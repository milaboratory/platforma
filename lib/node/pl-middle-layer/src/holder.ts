import { AnyRef, field, FieldRef, PlTransaction, ResourceRef } from '@milaboratory/pl-client-v2';
import { EphStdMap, StdMap } from './util';

/** Name of the field in block holder, that references the actual block-pack. */
export const HolderType = StdMap;
export const EphHolderType = EphStdMap;
export const HolderMainField = 'ref';

export function wrapInHolder(tx: PlTransaction, ref: AnyRef): ResourceRef {
  const holder = tx.createStruct(HolderType);
  const mainHolderField = field(holder, HolderMainField);
  tx.createField(mainHolderField, 'Input', ref);
  tx.lock(holder);
  return holder;
}

export function wrapInEphHolder(tx: PlTransaction, ref: AnyRef): ResourceRef {
  const holder = tx.createEphemeral(EphHolderType);
  const mainHolderField = field(holder, HolderMainField);
  tx.createField(mainHolderField, 'Input', ref);
  tx.lock(holder);
  return holder;
}


export function unwrapHolder(tx: PlTransaction, ref: AnyRef): FieldRef {
  return tx.getFutureFieldValue(ref, HolderMainField, 'Input');
}
