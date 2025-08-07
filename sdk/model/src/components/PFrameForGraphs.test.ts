import { describe, expect, test } from 'vitest';
import {enrichCompatible, getAvailableWithLinkersAxes} from './PFrameForGraphs';
import {
    AxisId, CanonicalizedJson,
    canonicalizeJson, DataInfo,
    getAxisId,
    PColumn,
    PColumnSpec,
    PColumnValues,
    PObjectId,
    Annotation,
    AxisSpecNormalized,
    getNormalizedAxesList,
} from "@milaboratories/pl-model-common";
import { TreeNodeAccessor } from "../render";

function getAllAxesFromSpecs (specs:PColumnSpec[]):Map<CanonicalizedJson<AxisId>, AxisSpecNormalized> {
    const allAxes:Map<CanonicalizedJson<AxisId>, AxisSpecNormalized> = new Map();
    for (const spec of specs) {
        for (const id of getNormalizedAxesList(spec.axesSpec)) {
            const aid = getAxisId(id);
            allAxes.set(canonicalizeJson(aid), id);
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
            axesSpec: [{type: 'String', name: 'axis1', domain: {key1: 'a'}, parentAxesSpec: []}],
            annotations: {[Annotation.Graph.IsVirtual]: 'true'}
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
            annotations: {[Annotation.Label]: 'Label of column2'},
            axesSpec: [{type: 'String', name: 'axis1', domain: {key0: 'commonDomain'}}]
        }
        const allAxes = getAllAxesFromSpecs([columnSpec1]);
        const columns: PColumn<TreeNodeAccessor | PColumnValues>[] = [
            {id: 'id1' as PObjectId, spec: columnSpec1, data: []},
            {id: 'id2' as PObjectId, spec: columnSpec2, data: []}
        ] as PColumn<PColumnValues>[]

        const resultColumns = enrichCompatible(allAxes, columns);
        expect(resultColumns[2].spec.annotations?.[Annotation.Label]).toEqual('Label of column2 / a');
        expect(resultColumns[3].spec.annotations?.[Annotation.Label]).toEqual('Label of column2 / b');
    })

    test('Linker column adds available axis', () => {
        const columnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'column1',
            valueType: 'Int',
            axesSpec: [
                {type: 'String', name: 'axis1', domain: {key1: 'a'}},
                {type: 'String', name: 'axis2', domain: {key1: 'b'}},
            ]
        };
        const linkerColumn13: PColumnSpec = {
            kind: 'PColumn',
            name: 'linker13',
            valueType: 'String',
            annotations: {[Annotation.IsLinkerColumn]: 'true'},
            axesSpec: [
                {type: 'String', name: 'axis1'},
                {type: 'String', name: 'axis3'}
            ]
        }

        const linkerColumns = [{id: 'id5' as PObjectId, spec: linkerColumn13, data: []}];
        const availableAxes = getAvailableWithLinkersAxes(
            linkerColumns,
            getAllAxesFromSpecs([columnSpec1])
        );
        expect([...availableAxes.values()].map((id) => id.name)).toEqual(['axis3'])
    })

    test('Linker columns add available axes by chains', () => {
        const columnSpec1: PColumnSpec = {
            kind: 'PColumn',
            name: 'column1',
            valueType: 'Int',
            axesSpec: [{type: 'String', name: 'axis1'}]
        };
        const linkerColumn12: PColumnSpec = {
            kind: 'PColumn',
            name: 'linker12',
            valueType: 'String',
            annotations: {[Annotation.IsLinkerColumn]: 'true'},
            axesSpec: [
                {type: 'String', name: 'axis1'},
                {type: 'String', name: 'axis2'}
            ]
        }
        const linkerColumn23: PColumnSpec = {
            kind: 'PColumn',
            name: 'linker23',
            valueType: 'String',
            annotations: {[Annotation.IsLinkerColumn]: 'true'},
            axesSpec: [
                {type: 'String', name: 'axis2'},
                {type: 'String', name: 'axis3'}
            ]
        }
        const linkerColumn34: PColumnSpec = {
            kind: 'PColumn',
            name: 'linker34',
            valueType: 'String',
            annotations: {[Annotation.IsLinkerColumn]: 'true'},
            axesSpec: [
                {type: 'String', name: 'axis3'},
                {type: 'String', name: 'axis4'}
            ]
        }

        const linkerColumns = [
            {id: 'id3' as PObjectId, spec: linkerColumn12, data: []},
            {id: 'id4' as PObjectId, spec: linkerColumn23, data: []},
            {id: 'id5' as PObjectId, spec: linkerColumn34, data: []},
        ];
        const availableAxes = getAvailableWithLinkersAxes(
            linkerColumns,
            getAllAxesFromSpecs([columnSpec1])
        );
        expect([...availableAxes.values()].map((id) => id.name)).toEqual(['axis2', 'axis3', 'axis4'])
    })
})
