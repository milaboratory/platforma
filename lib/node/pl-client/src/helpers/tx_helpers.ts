import type { PlTransaction } from '../core/transaction';
import type { FieldData, OptionalResourceId } from '../core/types';
import { isNotNullResourceId } from '../core/types';
import { cachedDeserialize, notEmpty } from '@milaboratories/ts-helpers';

export interface ValErr {
  valueId: OptionalResourceId;
  errorId: OptionalResourceId;
  error?: string;
}

export async function valErr(tx: PlTransaction, f: FieldData): Promise<ValErr> {
  const result = {
    valueId: f.value,
    errorId: f.error,
    error: '',
  };

  if (isNotNullResourceId(f.error)) {
    const e = await tx.getResourceData(f.error, true);
    const deserializationResult = cachedDeserialize(notEmpty(e.data));
    if (typeof deserializationResult !== 'string') {
      const dataStr = notEmpty(e.data).toString();
      throw new Error(`Unexpected error structure: ${dataStr.substring(0, Math.min(dataStr.length, 100))}...`);
    }
    result.error = deserializationResult;
  }

  return result;
}
