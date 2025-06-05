import {test, expect, describe} from '@jest/globals';
import {
    IS_VIRTUAL_COLUMN,
    LABEL_ANNOTATION,
    enrichCompatible
} from './PFrameForGraphs';
import {
    AxisId,
    canonicalizeJson, DataInfo,
    getAxisId,
    PColumn,
    PColumnSpec,
    PColumnValues,
    PObjectId
} from "@milaboratories/pl-model-common";
import {TreeNodeAccessor} from "../render";

function getAllAxesFromSpecs (specs:PColumnSpec[]):Map<string, AxisId> {
    const allAxes:Map<string, AxisId> = new Map();
    for (const spec of specs) {
        for (const id of spec.axesSpec) {
            const aid = getAxisId(id);
            allAxes.set(canonicalizeJson(aid), aid);
        }
    }
    return allAxes
}
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
        const allAxes = getAllAxesFromSpecs([columnSpec1, columnSpec2]);

        expect(enrichCompatible(allAxes, columns).length).toEqual(2);
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
        const allAxes = getAllAxesFromSpecs([columnSpec1]);
        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: columnSpec2, data: []}
        ] as PColumn<PColumnValues>[];

        const resultColumns = enrichCompatible(allAxes, columns);
        expect(resultColumns.length).toEqual(3);
        expect(resultColumns[2].id === columns[0].id).toEqual(false);
        expect(resultColumns[2].id === columns[1].id).toEqual(false);
        expect(resultColumns[2].spec).toEqual({
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
        const allAxes = getAllAxesFromSpecs([columnSpec1]);
        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: columnSpec2, data: []}
        ] as PColumn<PColumnValues>[]

        const resultColumns = enrichCompatible(allAxes, columns);
        expect(resultColumns.length).toEqual(2);
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
        const allAxes = getAllAxesFromSpecs([columnSpec1]);
        const columns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: columnSpec2, data: []}
        ] as PColumn<PColumnValues>[]

        const resultColumns = enrichCompatible(allAxes, columns);
        expect(resultColumns.length).toEqual(4);
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
        const allAxes = getAllAxesFromSpecs([columnSpec1]);
        const columns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: columnSpec2, data: []}
        ];
        const resultColumns = enrichCompatible(allAxes, columns);
        expect(resultColumns.length).toEqual(6);
    });

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
        const allAxes = getAllAxesFromSpecs([columnSpec1]);
        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: columnSpec2, data: []}
        ] as PColumn<PColumnValues>[]

        const resultColumns = enrichCompatible(allAxes, columns);
        expect(resultColumns[2].spec.annotations?.[LABEL_ANNOTATION]).toEqual('Label of column2 / a');
        expect(resultColumns[3].spec.annotations?.[LABEL_ANNOTATION]).toEqual('Label of column2 / b');
    })
})
