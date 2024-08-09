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

// @TODO nicolaygiman, ask me
export type Option<T = unknown> = {
  text: string | { title: string; description: string };
  value: T;
};

export type IOption<T = unknown> = {
  text: string;
  value: T;
};

/**
 * @deprecated
 */
export const maskIcons = [
  'checkmark',
  'download',
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
  'columns',
  'restart',
  'stop',
] as const;

/**
 * @deprecated
 */
export type MaskIconName = (typeof maskIcons)[number];

export const maskIcons16 = [
  'checkmark',
  'import',
  'clear',
  'chevron-right',
  'add',
  'play',
  'loading',
  'arrow-right',
  'clipboard',
  'link',
  'comp',
  'close',
  'restart',
  'stop',
] as const;

export type MaskIconName16 = (typeof maskIcons16)[number];

// @todo MaskIcons24

export type SliderMode = 'input' | 'text';
