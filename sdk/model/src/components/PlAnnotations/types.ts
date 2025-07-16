import type { PColumnSpec } from '@milaboratories/pl-model-common';

export type SimplifiedPColumnSpec = Pick<PColumnSpec, 'valueType' | 'annotations'>;
