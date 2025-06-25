import type { PColumnSpec } from '@platforma-sdk/model';

export type SimplifiedPColumnSpec = Pick<PColumnSpec, 'valueType' | 'annotations'>;
