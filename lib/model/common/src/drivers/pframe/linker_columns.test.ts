import {
    Annotation,
    AxisSpec,
    AxisSpecNormalized,
    getArrayFromAxisTree,
    getAxesTree,
    getNormalizedAxesList,
    getSetFromAxisTree,
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
import { LinkerMap } from './linker_columns';

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
        const [axis1, axis2, axis3, axis4, axis5] = getNormalizedAxesList([
            makeTestAxis({ name: 'id1' }),
            makeTestAxis({ name: 'id2' }),
            makeTestAxis({ name: 'id3' }),
            makeTestAxis({ name: 'id4' }),
            makeTestAxis({ name: 'id5' })
        ]);
        const linkerMap = LinkerMap.fromColumns([
            makeLinkerColumn({ name: 'c12', from: [axis1], to: [axis2] }),
            makeLinkerColumn({ name: 'c13', from: [axis1], to: [axis3] }),
            makeLinkerColumn({ name: 'c45', from: [axis4], to: [axis5] }),
        ]);

        let testCase = (params: {
            from: AxisSpecNormalized[];
            to: AxisSpecNormalized[];
            expected: string[];
        }) => {
            const linkers = linkerMap.getLinkerColumnsForAxes({
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
        const [axisA, axisB] = getNormalizedAxesList([
            makeTestAxis({ name: 'a' }),
            makeTestAxis({ name: 'b' })
        ]);
        const tree = getAxesTree(axisA);
        expect(getSetFromAxisTree(tree).size).toBe(1);
        expect(getArrayFromAxisTree(tree).length).toBe(1);

        expect(LinkerMap.getAxesGroups([axisA, axisB]).length).toBe(2);
    })

    test('Axis tree - with parents', () => {
        const axisD = makeTestAxis({ name: 'd' });
        const axisC = makeTestAxis({ name: 'c', parents: [axisD] });
        const axisB = makeTestAxis({ name: 'b', parents: [axisC] });
        const axisA = makeTestAxis({ name: 'a', parents: [axisB] });
        const [axisDn, axisCn, axisBn, axisAn] = getNormalizedAxesList([axisD, axisC, axisB, axisA])

        const tree = getAxesTree(axisAn);
        expect(getSetFromAxisTree(tree).size).toBe(4);
        expect(getArrayFromAxisTree(tree).length).toBe(4);

        for (const group of allPermutations([axisAn, axisBn, axisCn, axisDn])) {
            expect(LinkerMap.getAxesGroups(group).length).toBe(1);
        }

        const axisD2 = makeTestAxis({ name: 'd' });
        const axisC2 = makeTestAxis({ name: 'c', parents: [axisD2] });
        const axisB2 = makeTestAxis({ name: 'b' });
        const axisA2 = makeTestAxis({ name: 'a', parents: [axisB2] });
        const normalized2 = getNormalizedAxesList([axisD2, axisC2, axisB2, axisA2])

        for (const group of allPermutations(normalized2)) {
            expect(LinkerMap.getAxesGroups(group).length).toBe(2);
        }

        const axisD3 = makeTestAxis({ name: 'd' });
        const axisC3 = makeTestAxis({ name: 'c' });
        const axisB3 = makeTestAxis({ name: 'b' });
        const axisA3 = makeTestAxis({ name: 'a', parents: [axisB3] });
        const normalized3 = getNormalizedAxesList([axisD3, axisC3, axisB3, axisA3])

        for (const group of allPermutations(normalized3)) {
            expect(LinkerMap.getAxesGroups(group).length).toBe(3);
        }

        const axisD4 = makeTestAxis({ name: 'd' });
        const axisC4 = makeTestAxis({ name: 'c' });
        const axisB4 = makeTestAxis({ name: 'b' });
        const axisA4 = makeTestAxis({ name: 'a' });
        const normalized4 = getNormalizedAxesList([axisD4, axisC4, axisB4, axisA4])

        for (const group of allPermutations(normalized4)) {
            expect(LinkerMap.getAxesGroups(group).length).toBe(4);
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
        const group1Normalized = getNormalizedAxesList(group1);
        const group2Normalized = getNormalizedAxesList(group2);
        const group3Normalized = getNormalizedAxesList(group3);
        const [axisAn, axisBn, axisCn, axisDn, axisEn] = group1Normalized;

        const linker1 = makeLinkerColumn({ name: 'linker1', from: group1, to: group2 });
        const linker2 = makeLinkerColumn({ name: 'linker2', from: group2, to: group3 });

        const roots = LinkerMap.getAxesRoots(group1Normalized);

        expect(roots).toEqual([axisAn, axisEn]);

        const groups = LinkerMap.getAxesGroups([...group1Normalized, ...group2Normalized]);
        expect(groups.length).toBe(2);
        expect(groups[0]).toEqual(group1Normalized);
        expect(groups[1]).toEqual(group2Normalized);

        const linkersMap = LinkerMap.fromColumns([linker1, linker2]);

        expect(
            new Set(linkersMap.getReachableByLinkersAxesFromAxes(group2Normalized).map(a => a.name))
        ).toEqual(
            new Set(([...group1, ...group3]).map(a => a.name))
        );
        expect(linkersMap.getReachableByLinkersAxesFromAxes([axisDn])).toEqual([]);
        expect(linkersMap.getReachableByLinkersAxesFromAxes([axisBn])).toEqual([]);
    });

    test('Order of parents should not matter', () => {
        const axisA = makeTestAxis({ name: 'a' });
        const axisB = makeTestAxis({ name: 'b' });
        const axisC1 = makeTestAxis({ name: 'c', parents: [axisA, axisB] });
        const axisC2 = makeTestAxis({ name: 'c', parents: [axisB, axisA] });
        const axisD = makeTestAxis({ name: 'd' });

        const [a, b, c1, c2, d] = getNormalizedAxesList([axisA, axisB, axisC1, axisC2, axisD]);
        const linkerMap = LinkerMap.fromColumns([
            makeLinkerColumn({ name: 'linker1', from: [axisA, axisB, axisC1], to: [axisD] })
        ]);

        expect(linkerMap.getReachableByLinkersAxesFromAxes([c2])).not.toHaveLength(0);
        expect(linkerMap.getReachableByLinkersAxesFromAxes([c1])).not.toHaveLength(0);
    })
});
