import {AxisSpec, canonicalizeJson, PColumnIdAndSpec, PObjectId} from '@milaboratories/pl-model-common';
import {describe, expect, test} from 'vitest';
import {arrayFromAxisTree, getAxesGroups, getAxesRoots, getAxesTree, getCompositeLinkerMap, getLinkerColumnsForAxes, getReachableByLinkersAxesFromAxes, setFromAxisTree} from './linker_columns';

const PARENTS_ANNOTATION = 'pl7.app/parents';
const axisD: AxisSpec = { type: 'Int', name: 'd', annotations: { 'pl7.app/label': 'D axis' } };
const axisC: AxisSpec = { type: 'Int', name: 'c', annotations: { 'pl7.app/label': 'C axis' } };
const axisB: AxisSpec = { type: 'Int', name: 'b', annotations: { 'pl7.app/label': 'B axis' , [PARENTS_ANNOTATION]: canonicalizeJson([axisD]) } };
const axisA: AxisSpec = { type: 'Int', name: 'a', annotations: { 'pl7.app/label': 'A axis', [PARENTS_ANNOTATION]: canonicalizeJson([axisB, axisC]) } };
const axisE: AxisSpec = { type: 'Int', name: 'e', annotations: { 'pl7.app/label': 'E axis', [PARENTS_ANNOTATION]: canonicalizeJson([axisB, axisC]) } };

const axisF: AxisSpec = { type: 'Int', name: 'f', annotations: { 'pl7.app/label': 'F axis' } };

const axisH: AxisSpec = { type: 'Int', name: 'h', annotations: { 'pl7.app/label': 'H axis' } };


const linker1:PColumnIdAndSpec = {
    columnId: 'id1' as PObjectId, 
    spec: {
        kind: 'PColumn',
        axesSpec: [axisA, axisB, axisC, axisD, axisE, axisF], // left part: [A B C D E], right part: [F]
        valueType: 'String',
        name: 'linker1'
    }
};
const linker2:PColumnIdAndSpec = {
    columnId: 'id2' as PObjectId, 
    spec: {
        kind: 'PColumn',
        axesSpec: [axisF, axisH],
        valueType: 'String',
        name: 'linker2'
    }
};

describe('Linker columns', () => {
    test('Search in linker columns map', () => {
        const axis1: AxisSpec = { type: 'Int', name: 'id1'};
        const axis2: AxisSpec = { type: 'Int', name: 'id2'};
        const axis3: AxisSpec = { type: 'Int', name: 'id3'};
        const axis4: AxisSpec = { type: 'Int', name: 'id4'};
        const axis5: AxisSpec = { type: 'Int', name: 'id5'};
        const linkerMap = getCompositeLinkerMap([
            {columnId: 'id12' as PObjectId, spec: {kind: 'PColumn', valueType: 'String', name: 'c12', axesSpec: [axis1, axis2]}},
            {columnId: 'id13' as PObjectId, spec: {kind: 'PColumn', valueType: 'String', name: 'c13', axesSpec: [axis1, axis3]}},
            {columnId: 'id45' as PObjectId, spec: {kind: 'PColumn', valueType: 'String', name: 'c45', axesSpec: [axis4, axis5]}}
        ]);
        const linkers1 = getLinkerColumnsForAxes(linkerMap, [axis2], [axis3]).map(item => item.spec.name);
        expect(new Set(linkers1)).toEqual(new Set(['c12', 'c13']));

        const linkers2 = getLinkerColumnsForAxes(linkerMap, [axis1], [axis2]);
        expect(linkers2.length).toBe(1);
        expect(linkers2[0].spec.name).toBe('c12');

        const linkers3 = getLinkerColumnsForAxes(linkerMap, [axis1], [axis4], false);
        expect(linkers3.length).toBe(0);
    });

    test('Axis tree - without parents', () => {
        const axesInColumn:AxisSpec[] = [{name: 'Axis1', type: 'String'}];
        const tree = getAxesTree(axesInColumn[0]);
        const set = setFromAxisTree(tree);
        const arr = arrayFromAxisTree(tree);

        expect(set.size).toBe(1);
        expect(arr.length).toBe(1);


        const a:AxisSpec[] = [
            {
                name: 'a',
                type: 'Int',
                annotations: { 'pl7.app/label': 'A axis' }
            },
            {
                name: 'b',
                type: 'Int',
                annotations: { 'pl7.app/label': 'B axis' }
            }
        ]
        const groups = getAxesGroups(a);

        expect(groups.length).toBe(2);
    })

    test('Axis tree - with parents', () => {
        const axisB:AxisSpec = {
            name: 'b',
            type: 'Int',
        }
        const axisA:AxisSpec = {
            name: 'a',
            type: 'Int',
            annotations: { 'pl7.app/parents': canonicalizeJson([axisB]) }
        }
        const axesInColumn:AxisSpec[] = [axisA, axisB];
        const tree = getAxesTree(axisA);

        expect(tree).not.toBe(null);

        const set = setFromAxisTree(tree!);
        const arr = arrayFromAxisTree(tree!);

        expect(set.size).toBe(2);
        expect(arr.length).toBe(2);

        const groups = getAxesGroups(axesInColumn);

        expect(groups?.length).toBe(1);
    })

    test('Generate partial trees', () => {
        // Axes graph of parents (A, E - roots, C, B, D - parents) in some column:
        // A - C
        //  \_ B _ D
        // E/
        //
        // If the column is not a linker: trees to search linkers should be:
        // 1 C
        // 2 D
        // 3 B - D
        // 4 A - C
        //    \_ B - D
        // 5 E - B - D

        // If the axes are in a linker: trees must be in the linkers map:

        // 1 A - C
        //    \_ B _ D
        // 2 E - B - D


        const axesInColumn = [
            axisA,
            axisB,
            axisC,
            axisD,
            axisE
        ];
        const roots = getAxesRoots(axesInColumn);

        expect(roots).toEqual([axisA, axisE]);

        const axesInLinker = [
            axisA,
            axisB,
            axisC,
            axisD,
            axisE,
            axisF
        ];
        const groups = getAxesGroups(axesInLinker);
        expect(groups.length).toBe(2);
        expect(groups[0]).toEqual([axisA, axisB, axisC, axisD, axisE]);
        expect(groups[1]).toEqual([axisF]);

        const linkersMap = getCompositeLinkerMap([linker1, linker2]);

        expect(getReachableByLinkersAxesFromAxes([axisF], linkersMap)).toEqual([axisA, axisB, axisC, axisD, axisE, axisH]);
        expect(getReachableByLinkersAxesFromAxes([axisD], linkersMap)).toEqual([]);
        expect(getReachableByLinkersAxesFromAxes([axisB], linkersMap)).toEqual([]);
    });
});
