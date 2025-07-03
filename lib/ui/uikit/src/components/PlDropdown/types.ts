import type { ListOptionNormalized } from '../../types';

export type LOption<M = unknown> = ListOptionNormalized<M> & { isSelected: boolean; isActive: boolean; index: number };
