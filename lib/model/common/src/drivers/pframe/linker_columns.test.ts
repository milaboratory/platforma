import {
    Annotation,
    AxisSpec,
    PColumnIdAndSpec,
    ValueType,
} from './spec/index';
import { PObjectId } from '../../pool';
import { stringifyJson } from '../../json'
import {
    describe,
    expect,
    test,
} from 'vitest';
import {
    arrayFromAxisTree,
    getAxesGroups,
    getAxesRoots,
    getAxesTree,
    getCompositeLinkerMap,
    getLinkerColumnsForAxes,
    getReachableByLinkersAxesFromAxes,
    setFromAxisTree,
} from './linker_columns';

function makeTestAxis(params: {
    name: string;
    parents?: AxisSpec[];
}): AxisSpec {
    return {
        type: ValueType.Int,
        name: params.name,
        annotations: {
            [Annotation.Label]: `${params.name} axis`,
            ...(params.parents && params.parents.length > 0
                ? { [Annotation.Parents]: stringifyJson(params.parents) }
                : {}
            ),
        } satisfies Annotation,
    };
}

function makeLinkerColumn(params: {
    name: string;
    from: AxisSpec[];
    to: AxisSpec[];
}): PColumnIdAndSpec {
    return {
        columnId: params.name as PObjectId,
        spec: {
            kind: 'PColumn',
            valueType: ValueType.String,
            name: params.name,
            axesSpec: [...params.from, ...params.to],
            annotations: {
                [Annotation.Label]: `${params.name} column`,
                [Annotation.IsLinkerColumn]: stringifyJson(true),
            } satisfies Annotation,
        },
    };
}

/** Returns all permutations of initial array */
function allPermutations<T>(arr: T[]): T[][] {
    switch (arr.length) {
        case 0: return [];
        case 1: return [arr];
        case 2: return [arr, [arr[1], arr[0]]];
        default: return arr.reduce(
            (acc, item, i) => acc.concat(
                allPermutations<T>([...arr.slice(0, i), ...arr.slice(i + 1)])
                    .map(val => [item, ...val])
            ),
            [] as T[][],
        );
    }
};

describe('Linker columns', () => {
    test('Search in linker columns map', () => {
        const axis1 = makeTestAxis({ name: 'id1' });
        const axis2 = makeTestAxis({ name: 'id2' });
        const axis3 = makeTestAxis({ name: 'id3' });
        const axis4 = makeTestAxis({ name: 'id4' });
        const axis5 = makeTestAxis({ name: 'id5' });
        const linkerMap = getCompositeLinkerMap([
            makeLinkerColumn({ name: 'c12', from: [axis1], to: [axis2] }),
            makeLinkerColumn({ name: 'c13', from: [axis1], to: [axis3] }),
            makeLinkerColumn({ name: 'c45', from: [axis4], to: [axis5] }),
        ]);

        let testCase = (params: {
            from: AxisSpec[];
            to: AxisSpec[];
            expected: string[];
        }) => {
            const linkers = getLinkerColumnsForAxes({
                linkerMap,
                from: params.from,
                to: params.to,
                throwWhenNoLinkExists: false,
            });
            expect(linkers.map(item => item.spec.name).sort()).toEqual(params.expected);
        }

        testCase({ from: [axis2], to: [axis3], expected: ['c12', 'c13'] });
        testCase({ from: [axis1], to: [axis2], expected: ['c12'] });
        testCase({ from: [axis1], to: [axis4], expected: []});
    });

    test('Axis tree - without parents', () => {
        const axisA = makeTestAxis({ name: 'a' });
        const axisB = makeTestAxis({ name: 'b' });

        const tree = getAxesTree(axisA);
        expect(setFromAxisTree(tree).size).toBe(1);
        expect(arrayFromAxisTree(tree).length).toBe(1);

        expect(getAxesGroups([axisA, axisB]).length).toBe(2);
    })

    test('Axis tree - with parents', () => {
        const axisD = makeTestAxis({ name: 'd' });
        const axisC = makeTestAxis({ name: 'c', parents: [axisD] });
        const axisB = makeTestAxis({ name: 'b', parents: [axisC] });
        const axisA = makeTestAxis({ name: 'a', parents: [axisB] });

        const tree = getAxesTree(axisA);
        expect(setFromAxisTree(tree).size).toBe(4);
        expect(arrayFromAxisTree(tree).length).toBe(4);

        for (const group of allPermutations([axisA, axisB, axisC, axisD])) {
            expect(getAxesGroups(group).length).toBe(1);
        }

        const axisD2 = makeTestAxis({ name: 'd' });
        const axisC2 = makeTestAxis({ name: 'c', parents: [axisD2] });
        const axisB2 = makeTestAxis({ name: 'b' });
        const axisA2 = makeTestAxis({ name: 'a', parents: [axisB2] });

        for (const group of allPermutations([axisA2, axisB2, axisC2, axisD2])) {
            expect(getAxesGroups(group).length).toBe(2);
        }

        const axisD3 = makeTestAxis({ name: 'd' });
        const axisC3 = makeTestAxis({ name: 'c' });
        const axisB3 = makeTestAxis({ name: 'b' });
        const axisA3 = makeTestAxis({ name: 'a', parents: [axisB3] });

        for (const group of allPermutations([axisA3, axisB3, axisC3, axisD3])) {
            expect(getAxesGroups(group).length).toBe(3);
        }

        const axisD4 = makeTestAxis({ name: 'd' });
        const axisC4 = makeTestAxis({ name: 'c' });
        const axisB4 = makeTestAxis({ name: 'b' });
        const axisA4 = makeTestAxis({ name: 'a' });

        for (const group of allPermutations([axisA4, axisB4, axisC4, axisD4])) {
            expect(getAxesGroups(group).length).toBe(4);
        }
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

        const axisD = makeTestAxis({ name: 'd' });
        const axisC = makeTestAxis({ name: 'c' });
        const axisB = makeTestAxis({ name: 'b', parents: [axisD] });
        const axisA = makeTestAxis({ name: 'a', parents: [axisB, axisC] });
        const axisE = makeTestAxis({ name: 'e', parents: [axisB, axisC] });
        const axisF = makeTestAxis({ name: 'f' });
        const axisH = makeTestAxis({ name: 'h' });

        const group1 = [axisA, axisB, axisC, axisD, axisE];
        const group2 = [axisF];
        const group3 = [axisH];

        const linker1 = makeLinkerColumn({ name: 'linker1', from: group1, to: group2 });
        const linker2 = makeLinkerColumn({ name: 'linker2', from: group2, to: group3 });

        const roots = getAxesRoots(group1);

        expect(roots).toEqual([axisA, axisE]);

        const groups = getAxesGroups([...group1, ...group2]);
        expect(groups.length).toBe(2);
        expect(groups[0]).toEqual(group1);
        expect(groups[1]).toEqual(group2);

        const linkersMap = getCompositeLinkerMap([linker1, linker2]);

        expect(getReachableByLinkersAxesFromAxes(group2, linkersMap)).toEqual([...group1, ...group3]);
        expect(getReachableByLinkersAxesFromAxes([axisD], linkersMap)).toEqual([]);
        expect(getReachableByLinkersAxesFromAxes([axisB], linkersMap)).toEqual([]);
    });

    test('Order of parents should not matter', () => {
        const axisA = makeTestAxis({ name: 'a' });
        const axisB = makeTestAxis({ name: 'b' });
        const axisC1 = makeTestAxis({ name: 'c', parents: [axisA, axisB] });
        const axisC2 = makeTestAxis({ name: 'c', parents: [axisB, axisA] });
        const axisD = makeTestAxis({ name: 'd' });

        const linkerMap = getCompositeLinkerMap([
            makeLinkerColumn({ name: 'linker1', from: [axisC1], to: [axisD] }),
        ]);

        expect(getReachableByLinkersAxesFromAxes([axisC2], linkerMap)).not.toHaveLength(0);
    })
});
