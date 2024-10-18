import type { ImportFileHandle, Platforma, StorageHandle, Ref as ModelRef } from '@platforma-sdk/model';
import type { Ref, ComputedRef } from 'vue';

export type Size = 'small' | 'medium' | 'large';

export type MaybeRef<T> = T | Ref<T>;

export type MaybeReadonlyRef<T> = (() => T) | ComputedRef<T>;

export type MaybeComputedRef<T> = MaybeReadonlyRef<T> | MaybeRef<T>;

export type ElementPosition = Omit<DOMRect, 'toJSON'> & {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  offsetY: number;
  offsetX: number;
};

export type SimpleOption<T = unknown> =
  | {
      text: string;
      value: T;
    }
  | {
      label: string;
      value: T;
    };

export type SimpleOptionNormalized<T = unknown> = {
  label: string;
  description?: string;
  value: T;
};

export type ListOption<T = unknown> =
  | {
      text: string;
      description?: string;
      value: T;
    }
  | {
      label: string;
      description?: string;
      value: T;
    };

export type ListOptionNormalized<T = unknown> = {
  label: string;
  description?: string;
  value: T;
};

export type { ModelRef };

export type RefOption = {
  readonly label: string;
  readonly ref: ModelRef;
};

export type ListOptionType<Type> = Type extends ListOption<infer X>[] ? X : never;

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
  'settings-2',
] as const;

export type MaskIconName16 = (typeof maskIcons16)[number];

export const maskIcons24 = ['paper-clip', 'cloud-up', 'success', 'restart', 'close', 'clipboard'];

export type MaskIconName24 = (typeof maskIcons24)[number];

export type SliderMode = 'input' | 'text';

export type ImportedFiles = {
  storageHandle: StorageHandle;
  files: ImportFileHandle[];
};

declare global {
  const platforma: Platforma | undefined;
  interface Window {
    platforma: Platforma | undefined;
  }
}
