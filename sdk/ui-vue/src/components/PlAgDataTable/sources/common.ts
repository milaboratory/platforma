import type { PTableValue } from '@platforma-sdk/model';

export const PTableHidden = { type: 'hidden' } as const;
export type PTableHidden = typeof PTableHidden;

export function isPTableHidden(value: PTableValue | PTableHidden): value is PTableHidden {
  return typeof value === 'object' && value !== null && value.type === 'hidden';
}
