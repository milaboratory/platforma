import { FieldData, isNotNullResourceId } from '../core/types';

export function fieldResolved(data: Pick<FieldData, 'value' | 'error'>) {
  return isNotNullResourceId(data.error) || isNotNullResourceId(data.value);
}
