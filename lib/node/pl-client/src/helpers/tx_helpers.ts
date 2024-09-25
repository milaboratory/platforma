import type { PlTransaction } from '../core/transaction';
import type { FieldData, OptionalResourceId} from '../core/types';
import { isNotNullResourceId } from '../core/types';
import { notEmpty } from '@milaboratories/ts-helpers';

export interface ValErr {
  valueId: OptionalResourceId;
  errorId: OptionalResourceId;
  error?: string;
}

export async function valErr(tx: PlTransaction, f: FieldData): Promise<ValErr> {
  const result = {
    valueId: f.value,
    errorId: f.error,
    error: ''
  };

  if (isNotNullResourceId(f.error)) {
    const e = await tx.getResourceData(f.error, true);
    result.error = JSON.parse(notEmpty(e.data).toString());
  }

  return result;
}
