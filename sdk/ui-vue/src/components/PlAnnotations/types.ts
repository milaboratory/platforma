import type { PColumnSpec, SUniversalPColumnId } from '@platforma-sdk/model';

export type SimplifiedPColumnSpec = Pick<PColumnSpec, 'valueType' | 'annotations'>;

export type SimplifiedUniversalPColumnEntry = {
  id: SUniversalPColumnId;
  label: string;
  obj: SimplifiedPColumnSpec;
};
