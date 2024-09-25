import type { FieldData} from '../core/types';
import { isNotNullResourceId } from '../core/types';

export function fieldResolved(data: Pick<FieldData, 'value' | 'error'>) {
  return isNotNullResourceId(data.error) || isNotNullResourceId(data.value);
}
