import {test, expect, describe} from '@jest/globals';
import {
    enrichColumnsWithCompatible,
    getAdditionalColumns,
    getLinkerColumnsMap,
    LINKER_COLUMN_ANNOTATION,
    IS_VIRTUAL_COLUMN,
    LABEL_ANNOTATION
} from './PFrameForGraphs';
import {PColumn, PColumnSpec, PColumnValues, PObjectId} from "@milaboratories/pl-model-common";
import {TreeNodeAccessor} from "../render";

describe('PFrameForGraph', () => {
    test('columns are compatible, no additional columns', () => {
        const columnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'column1',
            valueType: 'Int',
            axesSpec: [
                {type: 'String', name: 'axis1', domain: {}},
                {type: 'Int', name: 'axis2', domain: {}}
            ]
        }
        const columnSpec2: PColumnSpec = {
            kind: 'PColumn',
            name: 'column2',
            valueType: 'Int',
            axesSpec: [{type: 'String', name: 'axis1', domain: {}}]
        }
        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [{
            id: 'id1' as PObjectId,
            spec: columnSpec1,
            data: []
        }, {
            id: 'id2' as PObjectId,
            spec: columnSpec2,
            data: []
        }
        ] as PColumn<PColumnValues>[]

        expect(getAdditionalColumns(columns).length).toEqual(0);
    });

    test('columns are not compatible, 1 additional column', () => {
        const columnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'column1',
            valueType: 'Int',
            axesSpec: [{type: 'String', name: 'axis1', domain: {key1: 'a'}}]
        }
        const columnSpec2: PColumnSpec = {
            kind: 'PColumn',
            name: 'column2',
            valueType: 'Int',
            axesSpec: [{type: 'String', name: 'axis1', domain: {}}]
        }
        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: columnSpec2, data: []}
        ] as PColumn<PColumnValues>[]

        const additionalColumns = getAdditionalColumns(columns);
        expect(additionalColumns.length).toEqual(1);
        expect(additionalColumns[0].id === columns[0].id).toEqual(false);
        expect(additionalColumns[0].id === columns[1].id).toEqual(false);
        expect(additionalColumns[0].spec).toEqual({
            kind: 'PColumn',
            name: 'column2',
            valueType: 'Int',
            axesSpec: [{type: 'String', name: 'axis1', domain: {key1: 'a'}}],
            annotations: {[IS_VIRTUAL_COLUMN]: 'true'}
        });
    });
    test('columns are not compatible, additional columns are impossible', () => {
        const columnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'column1',
            valueType: 'Int',
            axesSpec: [{type: 'String', name: 'axis1', domain: {key1: 'a'}}]
        }
        const columnSpec2: PColumnSpec = {
            kind: 'PColumn',
            name: 'column2',
            valueType: 'Int',
            axesSpec: [{type: 'String', name: 'axis1', domain: {key2: 'b'}}]
        }
        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: columnSpec2, data: []}
        ] as PColumn<PColumnValues>[]

        const additionalColumns = getAdditionalColumns(columns);
        expect(additionalColumns.length).toEqual(0);
    });
    test('columns are not compatible, 2 additional columns', () => {
        const columnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'column1',
            valueType: 'Int',
            axesSpec: [
                {type: 'String', name: 'axis1', domain: {key1: 'a'}},
                {type: 'String', name: 'axis1', domain: {key1: 'b'}},
            ]
        }
        const columnSpec2: PColumnSpec = {
            kind: 'PColumn',
            name: 'column2',
            valueType: 'Int',
            axesSpec: [{type: 'String', name: 'axis1', domain: {}}]
        }
        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: columnSpec2, data: []}
        ] as PColumn<PColumnValues>[]

        const additionalColumns = getAdditionalColumns(columns);
        expect(additionalColumns.length).toEqual(2);
    });
    test('columns are not compatible, 4 additional columns - by 2 axes', () => {
        const columnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'column1',
            valueType: 'Int',
            axesSpec: [
                {type: 'String', name: 'axis1', domain: {key1: 'a'}},
                {type: 'String', name: 'axis1', domain: {key1: 'b'}},
                {type: 'String', name: 'axis2', domain: {key1: 'a'}},
                {type: 'String', name: 'axis2', domain: {key1: 'b'}},
            ]
        }
        const columnSpec2: PColumnSpec = {
            kind: 'PColumn',
            name: 'column2',
            valueType: 'Int',
            axesSpec: [
                {type: 'String', name: 'axis1', domain: {}},
                {type: 'String', name: 'axis2', domain: {}}
            ]
        }
        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: columnSpec2, data: []}
        ] as PColumn<PColumnValues>[]

        const additionalColumns = getAdditionalColumns(columns);
        expect(additionalColumns.length).toEqual(4);
    });

    test('enrichColumnsWithCompatibleMetadata', () => {
        const columnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'column1',
            valueType: 'Int',
            axesSpec: [
                {type: 'String', name: 'axis1', domain: {key1: 'a'}},
                {type: 'String', name: 'axis2', domain: {key1: 'b'}},
            ]
        };
        const metaColumnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'metadata1',
            valueType: 'Int',
            axesSpec: [{type: 'String', name: 'axis1'}]
        };
        const metaColumnSpec2: PColumnSpec = {
            kind: 'PColumn',
            name: 'metadata2',
            valueType: 'String',
            axesSpec: [{type: 'String', name: 'axis1', domain: {key1: 'a'}}]
        };
        const metaColumnSpec3: PColumnSpec = {
            kind: 'PColumn',
            name: 'metadata2',
            valueType: 'String',
            axesSpec: [{type: 'String', name: 'axis3'}]
        };

        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
        ] as PColumn<PColumnValues>[];
        const upstream: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: metaColumnSpec1, data: []},
            {id: 'id3' as PObjectId, spec: metaColumnSpec2, data: []},
            {id: 'id4' as PObjectId, spec: metaColumnSpec3, data: []},
        ] as PColumn<PColumnValues>[];

        const enrichedColumns = enrichColumnsWithCompatible(columns, upstream);
        expect(enrichedColumns.map((c) => c.id)).toEqual(['id1', 'id2', 'id3'])
    })

    test('enrichColumnsWithCompatibleMetadata doesn\'t add column with identical spec', () => {
        const columnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'column1',
            valueType: 'Int',
            axesSpec: [
                {type: 'String', name: 'axis1', domain: {key1: 'a'}},
                {type: 'String', name: 'axis2', domain: {key1: 'b'}},
            ]
        };
        const metaColumnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'metadata1',
            valueType: 'Int',
            axesSpec: [{type: 'String', name: 'axis1'}]
        };
        const metaColumnSpec2: PColumnSpec = {
            kind: 'PColumn',
            name: 'metadata2',
            valueType: 'String',
            axesSpec: [{type: 'String', name: 'axis1', domain: {key1: 'a'}}]
        };

        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
        ] as PColumn<PColumnValues>[];
        const upstream: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id2' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id3' as PObjectId, spec: metaColumnSpec1, data: []},
            {id: 'id4' as PObjectId, spec: metaColumnSpec2, data: []},
        ] as PColumn<PColumnValues>[];

        const enrichedColumns = enrichColumnsWithCompatible(columns, upstream);
        expect(enrichedColumns.map((c) => c.id)).toEqual(['id1', 'id3', 'id4'])
    })

    test('Labels of added columns include added domains, but not include common domains', () => {
        const columnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'column1',
            valueType: 'Int',
            axesSpec: [
                {type: 'String', name: 'axis1', domain: {key0: 'commonDomain', key1: 'a', key2: 'c'}},
                {type: 'String', name: 'axis1', domain: {key0: 'commonDomain', key1: 'b', key2: 'c'}},
            ]
        }
        const columnSpec2: PColumnSpec = {
            kind: 'PColumn',
            name: 'column2',
            valueType: 'Int',
            annotations: {[LABEL_ANNOTATION]: 'Label of column2'},
            axesSpec: [{type: 'String', name: 'axis1', domain: {key0: 'commonDomain'}}]
        }
        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: columnSpec2, data: []}
        ] as PColumn<PColumnValues>[]

        const additionalColumns = getAdditionalColumns(columns);
        expect(additionalColumns[0].spec.annotations?.[LABEL_ANNOTATION]).toEqual('Label of column2 / a');
        expect(additionalColumns[1].spec.annotations?.[LABEL_ANNOTATION]).toEqual('Label of column2 / b');
    })

    test('Column added from upstream with linker column', () => {
        const columnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'column1',
            valueType: 'Int',
            axesSpec: [
                {type: 'String', name: 'axis1', domain: {key1: 'a'}},
                {type: 'String', name: 'axis2', domain: {key1: 'b'}},
            ]
        };
        const metaColumnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'metadata1',
            valueType: 'Int',
            axesSpec: [{type: 'String', name: 'axis1'}]
        };
        const metaColumnSpec2: PColumnSpec = {
            kind: 'PColumn',
            name: 'metadata2',
            valueType: 'String',
            axesSpec: [{type: 'String', name: 'axis1', domain: {key1: 'a'}}]
        };
        const metaColumnSpec3: PColumnSpec = {
            kind: 'PColumn',
            name: 'metadata2',
            valueType: 'String',
            axesSpec: [{type: 'String', name: 'axis3'}]
        };
        const linkerColumn13: PColumnSpec = {
            kind: 'PColumn',
            name: 'linker13',
            valueType: 'String',
            annotations: {[LINKER_COLUMN_ANNOTATION]: 'true'},
            axesSpec: [
                {type: 'String', name: 'axis1'},
                {type: 'String', name: 'axis3'}
            ]
        }

        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
        ] as PColumn<PColumnValues>[];
        const upstream: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: metaColumnSpec1, data: []},
            {id: 'id3' as PObjectId, spec: metaColumnSpec2, data: []},
            {id: 'id4' as PObjectId, spec: metaColumnSpec3, data: []},
            {id: 'id5' as PObjectId, spec: linkerColumn13, data: []},
        ] as PColumn<PColumnValues>[];

        const linkerColumns = [{id: 'id5' as PObjectId, spec: linkerColumn13, data: []}];
        const linkerColumnsMap = getLinkerColumnsMap(linkerColumns);
        const enrichedColumns = enrichColumnsWithCompatible(columns, upstream, linkerColumns, linkerColumnsMap);
        expect(enrichedColumns.map((c) => c.id)).toEqual(['id1', 'id2', 'id3', 'id4', 'id5'])
    })

    test('Column added from upstream with linker columns chain', () => {
        const columnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'column1',
            valueType: 'Int',
            axesSpec: [{type: 'String', name: 'axis1'}]
        };
        const metaColumnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'metadata1',
            valueType: 'Int',
            axesSpec: [{type: 'String', name: 'axis4'}]
        };
        const linkerColumn12: PColumnSpec = {
            kind: 'PColumn',
            name: 'linker12',
            valueType: 'String',
            annotations: {[LINKER_COLUMN_ANNOTATION]: 'true'},
            axesSpec: [
                {type: 'String', name: 'axis1'},
                {type: 'String', name: 'axis2'}
            ]
        }
        const linkerColumn23: PColumnSpec = {
            kind: 'PColumn',
            name: 'linker23',
            valueType: 'String',
            annotations: {[LINKER_COLUMN_ANNOTATION]: 'true'},
            axesSpec: [
                {type: 'String', name: 'axis2'},
                {type: 'String', name: 'axis3'}
            ]
        }
        const linkerColumn34: PColumnSpec = {
            kind: 'PColumn',
            name: 'linker34',
            valueType: 'String',
            annotations: {[LINKER_COLUMN_ANNOTATION]: 'true'},
            axesSpec: [
                {type: 'String', name: 'axis3'},
                {type: 'String', name: 'axis4'}
            ]
        }

        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
        ] as PColumn<PColumnValues>[];
        const upstream: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: metaColumnSpec1, data: []},
            {id: 'id3' as PObjectId, spec: linkerColumn12, data: []},
            {id: 'id4' as PObjectId, spec: linkerColumn23, data: []},
            {id: 'id5' as PObjectId, spec: linkerColumn34, data: []},
        ] as PColumn<PColumnValues>[];

        const linkerColumns = [
            {id: 'id3' as PObjectId, spec: linkerColumn12, data: []},
            {id: 'id4' as PObjectId, spec: linkerColumn23, data: []},
            {id: 'id5' as PObjectId, spec: linkerColumn34, data: []},
        ];
        const linkerColumnsMap = getLinkerColumnsMap(linkerColumns);
        const enrichedColumns = enrichColumnsWithCompatible(columns, upstream, linkerColumns, linkerColumnsMap);
        expect(enrichedColumns.map((c) => c.id)).toEqual(['id1', 'id2', 'id3', 'id4', 'id5'])
    })
})
