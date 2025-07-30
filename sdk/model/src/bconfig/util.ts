import type { BlockSection } from '@milaboratories/pl-model-common';

type OnlyString<S> = S extends string ? S : '';

// prettier-ignore
export type DeriveHref<S> = S extends readonly BlockSection[]
  ? OnlyString<Extract<S[number], { type: 'link' }>['href']>
  : never;
