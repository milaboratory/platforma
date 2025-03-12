import {test, expect, describe} from '@jest/globals';
import {enrichColumnsWithCompatibleMetadata, getAdditionalColumns, IS_VIRTUAL_COLUMN} from './PFrameForGraphs';
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

        const enrichedColumns = enrichColumnsWithCompatibleMetadata(columns, upstream);
        expect(enrichedColumns.map((c) => c.id)).toEqual(['id1', 'id2', 'id3'])
    })
})
