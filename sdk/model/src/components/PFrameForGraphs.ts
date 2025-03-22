import {
    AxisId,
    getAxisId,
    isPColumn,
    matchAxisId,
    PColumn,
    PColumnValues,
    PFrameHandle,
    PObjectId,
    ValueType,
} from '@milaboratories/pl-model-common';
import {RenderCtx, TreeNodeAccessor} from '../render';

/** Create id for column copy with added keys in axes domains */
const colId = (id: PObjectId, domains: (Record<string, string> | undefined)[]) => {
    let wid = id.toString();
    domains?.forEach(domain => {
        if (domain) {
            for (const [k, v] of Object.entries(domain)) {
                wid += k;
                wid += v;
            }
        }
    });
    return wid;
};

/** All combinations with 1 key from each list */
function getKeysCombinations(idsLists: AxisId[][]) {
    if (!idsLists.length) {
        return [];
    }
    let result: AxisId[][] = [[]];
    idsLists.forEach(list => {
        const nextResult: AxisId[][] = [];
        list.forEach(key => {
            nextResult.push(...result.map(resultItem => [...resultItem, key]));
        });
        result = nextResult;
    });
    return result;
}

/** Check if axes of secondary column are exactly in axes of main column */
function checkFullCompatibility(
    mainColumn: PColumn<TreeNodeAccessor | PColumnValues>,
    secondaryColumn: PColumn<TreeNodeAccessor | PColumnValues>
): boolean {
    const mainAxesIds = mainColumn.spec.axesSpec.map(getAxisId);
    const secondaryAxesIds = secondaryColumn.spec.axesSpec.map(getAxisId);
    return secondaryAxesIds.every(id => mainAxesIds.some(mainId => matchAxisId(mainId, id) && matchAxisId(id, mainId)));
}

/** Check if axes of secondary column are in axes of main column, but they can have compatible difference in domains */
function checkCompatibility(
    mainColumn: PColumn<TreeNodeAccessor | PColumnValues>,
    secondaryColumn: PColumn<TreeNodeAccessor | PColumnValues>
): boolean {
    const mainAxesIds = mainColumn.spec.axesSpec.map(getAxisId);
    const secondaryAxesIds = secondaryColumn.spec.axesSpec.map(getAxisId);
    return secondaryAxesIds.every(id => mainAxesIds.some(mainId => matchAxisId(mainId, id)));
}

export const IS_VIRTUAL_COLUMN = 'pl7.app/graph/isVirtual'; // annotation for column duplicates with extended domains
export const LABEL_ANNOTATION = 'pl7.app/label';

/** Main column can have additional domains, if secondary column (meta-column) has all axes match main column axes
 we can add its copy with missed domain fields for compatibility */
function getAdditionalColumnsForPair(
    mainColumn: PColumn<TreeNodeAccessor | PColumnValues>,
    secondaryColumn: PColumn<TreeNodeAccessor | PColumnValues>
): PColumn<TreeNodeAccessor | PColumnValues>[] {
    const mainAxesIds = mainColumn.spec.axesSpec.map(getAxisId);
    const secondaryAxesIds = secondaryColumn.spec.axesSpec.map(getAxisId);

    const isFullCompatible = checkFullCompatibility(mainColumn, secondaryColumn);
    if (isFullCompatible) { // in this case it isn't necessary to add more columns
        return [];
    }
    const isCompatible = checkCompatibility(mainColumn, secondaryColumn);
    if (!isCompatible) { // in this case it is impossible to add some compatible column
        return [];
    }
    // options with different possible domains for every axis of secondary column
    const secondaryIdsOptions = secondaryAxesIds.map(id => {
        return mainAxesIds.filter(mainId => matchAxisId(mainId, id));
    });
    // all possible combinations of axes with added domains
    const secondaryIdsVariants = getKeysCombinations(secondaryIdsOptions);

    // sets of added to column domain fields
    const allAddedDomainValues = new Set<string>();
    const addedNotToAllVariantsDomainValues = new Set<string>();
    const addedByVariantsDomainValues = secondaryIdsVariants.map(idsList => {
        const addedSet = new Set<string>();
        idsList.map((axisId, idx) => {
            const d1 = secondaryColumn.spec.axesSpec[idx].domain;
            const d2 = axisId.domain;
            Object.entries(d2 ?? {}).forEach(([key, value]) => {
                if (d1?.[key] === undefined) {
                    addedSet.add(value);
                    allAddedDomainValues.add(value);
                }
            });
            return ({
                ...axisId,
                annotations: secondaryColumn.spec.axesSpec[idx].annotations
            })
        });
        return addedSet;
    });
    [...allAddedDomainValues].forEach(addedPart => {
        if (addedByVariantsDomainValues.some(s => !s.has(addedPart))) {
            addedNotToAllVariantsDomainValues.add(addedPart);
        }
    })

    return secondaryIdsVariants.map((idsList, idx) => {
        const id = colId(secondaryColumn.id, idsList.map(id => id.domain));

        const label = secondaryColumn.spec.annotations?.[LABEL_ANNOTATION] ?? '';
        const labelDomainPart = ([...addedByVariantsDomainValues[idx]])
            .filter(str => addedNotToAllVariantsDomainValues.has(str))
            .sort()
            .join(' / ');

        return {
            id: id as PObjectId,
            spec: {
                ...secondaryColumn.spec,
                axesSpec: idsList.map((axisId, idx) => ({
                    ...axisId,
                    annotations: secondaryColumn.spec.axesSpec[idx].annotations
                })),
                annotations: {
                    ...secondaryColumn.spec.annotations,
                    [LABEL_ANNOTATION]: label && labelDomainPart ? label + ' / ' + labelDomainPart : label + labelDomainPart,
                    [IS_VIRTUAL_COLUMN]: 'true'
                }
            },
            data: secondaryColumn.data
        };
    });
}

export function getAdditionalColumns(columns: PColumn<TreeNodeAccessor | PColumnValues>[]): PColumn<TreeNodeAccessor | PColumnValues>[] {
    const additionalColumns: PColumn<TreeNodeAccessor | PColumnValues>[] = [];
    for (let i = 0; i < columns.length; i++) {
        for (let j = i + 1; j < columns.length; j++) {
            const column1 = columns[i];
            const column2 = columns[j];

            // check if column 1 is meta for column 2 or backward
            additionalColumns.push(
                ...getAdditionalColumnsForPair(column1, column2),
                ...getAdditionalColumnsForPair(column2, column1)
            );
        }
    }
    return additionalColumns;
}

export function enrichColumnsWithCompatible(
    mainColumns: PColumn<TreeNodeAccessor | PColumnValues>[],
    secondaryColumns: PColumn<TreeNodeAccessor | PColumnValues>[]
): PColumn<TreeNodeAccessor | PColumnValues>[] {
    const result = [...mainColumns];
    for (const secondaryColumn of secondaryColumns) {
        for (const mainColumn of mainColumns) {
            if (mainColumn.id === secondaryColumn.id) {
                break;
            }
            if (checkCompatibility(mainColumn, secondaryColumn)) {
                result.push(secondaryColumn);
                break;
            }
        }
    }
    return result;
}

const VALUE_TYPES: ValueType[] = [
    'Int',
    'Long',
    'Float',
    'Double',
    'String',
    'Bytes'
];

export function createPFrameForGraphs<A, U>(
    ctx: RenderCtx<A, U>,
    blockColumns?: PColumn<TreeNodeAccessor | PColumnValues>[]
): PFrameHandle | undefined {
    if (blockColumns === undefined) return undefined;

    const upstreamColumns = ctx.resultPool
        .getData()
        .entries.map((v) => v.obj)
        .filter(isPColumn)
        .filter((column) => VALUE_TYPES.includes(column.spec.valueType));

    const columnsWithCompatibleFromUpstream = enrichColumnsWithCompatible(blockColumns, upstreamColumns);

    // additional columns are duplicates with extra fields in domains for compatibility in all possible pairs of columns set
    const extendedColumns = [...columnsWithCompatibleFromUpstream, ...getAdditionalColumns(columnsWithCompatibleFromUpstream)];

    // if at least one column is not yet ready, we can't show the table
    if (
        extendedColumns.some(
            (a) => a.data instanceof TreeNodeAccessor && !a.data.getIsReadyOrError()
        )
    )
        return undefined;

    return ctx.createPFrame(extendedColumns);
}