import type { Ref, ComputedRef } from 'vue';

export type Size = 'small' | 'medium' | 'large';

export type MaybeRef<T> = T | Ref<T>;

export type MaybeReadonlyRef<T> = (() => T) | ComputedRef<T>;

export type MaybeComputedRef<T> = MaybeReadonlyRef<T> | MaybeRef<T>;

export type Position = Omit<DOMRect, 'toJSON'> & {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  offsetY: number;
  offsetX: number;
};

export type Option<T = unknown> = {
  text: string;
  value: T;
};

export const maskIcons = [
  'checkmark',
  'import',
  'clear',
  'chevron-right',
  'add',
  'play',
  'loader',
  'arrow-right',
  'clipboard',
  'paper-clip',
  'settings-2',
  'filters',
  'local',
  'server-on',
  'close',
] as const;

export type MaskIconName = (typeof maskIcons)[number];
