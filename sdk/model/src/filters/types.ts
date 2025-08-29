import type { PColumnSpec, SUniversalPColumnId } from '@milaboratories/pl-model-common';

export type SimplifiedPColumnSpec = Pick<PColumnSpec, 'valueType' | 'annotations'>;

// Define recursive type explicitl
export type FiltersUi = { id?: number; name?: string; isExpanded?: boolean }
  & ({ type: undefined }
    | { type: 'or'; filters: FiltersUi[] }
    | { type: 'and'; filters: FiltersUi[] }
    | { type: 'not'; filter: FiltersUi }
    | { type: 'isNA'; column: SUniversalPColumnId }
    | { type: 'isNotNA'; column: SUniversalPColumnId }
    | { type: 'patternEquals'; column: SUniversalPColumnId; value: string }
    | { type: 'patternNotEquals'; column: SUniversalPColumnId; value: string }
    | { type: 'patternContainSubsequence'; column: SUniversalPColumnId; value: string }
    | { type: 'patternNotContainSubsequence'; column: SUniversalPColumnId; value: string }
    | { type: 'topN'; column: SUniversalPColumnId; n: number }
    | { type: 'bottomN'; column: SUniversalPColumnId; n: number }
    | { type: 'lessThan'; column: SUniversalPColumnId; x: number }
    | { type: 'greaterThan'; column: SUniversalPColumnId; x: number }
    | { type: 'lessThanOrEqual'; column: SUniversalPColumnId; x: number }
    | { type: 'greaterThanOrEqual'; column: SUniversalPColumnId; x: number }
    | { type: 'lessThanColumn'; column: SUniversalPColumnId; rhs: SUniversalPColumnId; minDiff?: number }
    | { type: 'lessThanColumnOrEqual'; column: SUniversalPColumnId; rhs: SUniversalPColumnId; minDiff?: number });

export type FiltersUiType = Exclude<FiltersUi, { type: undefined }>['type'];

export type FiltersUiOfType<T extends FiltersUiType> = Extract<FiltersUi, { type: T }>;
