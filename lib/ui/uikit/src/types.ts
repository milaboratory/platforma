import type { ImportFileHandle, Platforma, PlRef as ModelRef, StorageHandle } from '@platforma-sdk/model';
import type { Component, ComputedRef, Ref } from 'vue';
import { icons16 } from './generated/icons-16';
import { icons24 } from './generated/icons-24';

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

export { icons16, icons24 };

export type MaskIconName16 = (typeof icons16)[number];

export type MaskIconName24 = (typeof icons24)[number];

export type SliderMode = 'input' | 'text';

export type ImportedFiles = {
  storageHandle?: StorageHandle;
  files: ImportFileHandle[];
};

export type InferComponentProps<C extends Component> = C extends Component<infer P> ? P : never;

declare global {
  interface Window {
    platforma: Platforma | undefined;
  }
}
