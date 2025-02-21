import {
    AxisId,
    getAxisId,
    matchAxisId,
    PColumn,
    PColumnValues, PFrameHandle,
    PObjectId,
} from '@milaboratories/pl-model-common';
import { RenderCtx, TreeNodeAccessor } from '../render';

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

/** Main column can have additional domains, if secondary column (meta-column) has all axes match main column axes
we can add its copy with missed domain fields for compatibility */
function getAdditionalColumnsForPair(
    mainColumn: PColumn<TreeNodeAccessor | PColumnValues>,
    secondaryColumn: PColumn<TreeNodeAccessor | PColumnValues>
): PColumn<TreeNodeAccessor | PColumnValues>[] {
    const mainAxesIds = mainColumn.spec.axesSpec.map(getAxisId);
    const secondaryAxesIds = secondaryColumn.spec.axesSpec.map(getAxisId);

    const isFullCompatible = secondaryAxesIds.every(id => mainAxesIds.some(mainId => matchAxisId(mainId, id) && matchAxisId(id, mainId)));
    if (isFullCompatible) { // in this case it isn't necessary to add more columns
        return [];
    }
    const isCompatible = secondaryAxesIds.every(id => mainAxesIds.some(mainId => matchAxisId(mainId, id)));
    if (!isCompatible) { // in this case it is impossible to add some compatible column
        return [];
    }
    // options with different possible domains for every axis of secondary column
    const secondaryIdsOptions = secondaryAxesIds.map(id => {
        return mainAxesIds.filter(mainId => matchAxisId(mainId, id));
    });
    // all possible combinations of axes with added domains
    const secondaryIdsVariants = getKeysCombinations(secondaryIdsOptions);

    return secondaryIdsVariants.map(idsList => {
        const id = colId(secondaryColumn.id, idsList.map(id => id.domain));
        return {
            id: id as PObjectId,
            spec: {
                ...secondaryColumn.spec,
                axesSpec: idsList.map((axisId, idx) => ({
                    ...axisId,
                    annotations: secondaryColumn.spec.axesSpec[idx].annotations
                }))
            },
            data: secondaryColumn.data
        };
    });
}

export function getAdditionalColumns(columns: PColumn<TreeNodeAccessor | PColumnValues>[]):PColumn<TreeNodeAccessor | PColumnValues>[] {
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

export function createPFrameForGraphs<A, U>(
    ctx: RenderCtx<A, U>,
    columns: PColumn<TreeNodeAccessor | PColumnValues>[]
): PFrameHandle | undefined {
    const extendedColumns = [...columns, ...getAdditionalColumns(columns)];
    // if at least one column is not yet ready, we can't show the table
    if (
        extendedColumns.some(
            (a) => a.data instanceof TreeNodeAccessor && !a.data.getIsReadyOrError()
        )
    )
        return undefined;

    return ctx.createPFrame(extendedColumns);
}
