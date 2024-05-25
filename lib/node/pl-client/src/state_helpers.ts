import { FieldData, isNotNullResourceId } from './types';

export function fieldResolved(data: Pick<FieldData, 'value' | 'error'>) {
  return isNotNullResourceId(data.error) || isNotNullResourceId(data.value);
}
