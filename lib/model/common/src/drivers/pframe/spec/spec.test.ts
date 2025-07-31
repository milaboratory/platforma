import {
    Annotation,
    AxisSpec,
    AxisSpecNormalized,
    getAxisId,
    ValueType,
    getDenormalizedAxesList,
    getNormalizedAxesList,
} from './spec';
import { canonicalizeJson, stringifyJson } from '../../../json'
import {
    describe,
    expect,
    test,
} from 'vitest';

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

function makeTestAxisWithParentIdxs(params: {
    name: string;
    parents?: number[];
}): AxisSpec {
    return {
        type: ValueType.Int,
        name: params.name,
        parentAxes: params.parents
    };
}

describe('Linker columns', () => {
    test('Normalization of axes with parents in indexes/annotations', () => {
        function compareAxesLists(list1:AxisSpecNormalized[], list2:AxisSpecNormalized[]) {
            list1.forEach((el1, idx) => {
                const el2 = list2[idx];
                const id1 = canonicalizeJson(getAxisId(el1));
                const id2 = canonicalizeJson(getAxisId(el2));
                expect(id1).toEqual(id2);

                const parents1 = canonicalizeJson(el1.parentAxesSpec.map(getAxisId));
                const parents2 = canonicalizeJson(el2.parentAxesSpec.map(getAxisId));
                expect(parents1).toEqual(parents2);
            })
        }

        // case 1
        const normalized1 = getNormalizedAxesList([
            makeTestAxisWithParentIdxs({ name: 'd' }),
            makeTestAxisWithParentIdxs({ name: 'c', parents: [0] }), // parent D
            makeTestAxisWithParentIdxs({ name: 'b' }),
            makeTestAxisWithParentIdxs({ name: 'a', parents: [2] }) // parent B
        ])

        const axisD1 = makeTestAxis({ name: 'd' });
        const axisC1 = makeTestAxis({ name: 'c', parents: [axisD1] });
        const axisB1 = makeTestAxis({ name: 'b' });
        const axisA1 = makeTestAxis({ name: 'a', parents: [axisB1] });
        const normalized2 = getNormalizedAxesList([axisD1, axisC1, axisB1, axisA1]);

        compareAxesLists(normalized1, normalized2);

        // case 2
        const normalized3 = getNormalizedAxesList([
            makeTestAxisWithParentIdxs({ name: 'd' }),
            makeTestAxisWithParentIdxs({ name: 'c' }), 
            makeTestAxisWithParentIdxs({ name: 'b', parents: [0] }), // parent D
            makeTestAxisWithParentIdxs({ name: 'a', parents: [1, 2] }) // parents B C
        ])

        const axisD2 = makeTestAxis({ name: 'd' });
        const axisC2 = makeTestAxis({ name: 'c' });
        const axisB2 = makeTestAxis({ name: 'b', parents: [axisD2]  });
        const axisA2 = makeTestAxis({ name: 'a', parents: [axisB2, axisC2] });
        const normalized4 = getNormalizedAxesList([axisD2, axisC2, axisB2, axisA2]);
        
        compareAxesLists(normalized3, normalized4);

        // case 3

        const normalized5 = getNormalizedAxesList([
            makeTestAxisWithParentIdxs({ name: 'e' }),
            makeTestAxisWithParentIdxs({ name: 'd' }),
            makeTestAxisWithParentIdxs({ name: 'c', parents: [1] }), // parent D
            makeTestAxisWithParentIdxs({ name: 'b', parents: [2] }), // parent C
            makeTestAxisWithParentIdxs({ name: 'a', parents: [3] })  // parent B
        ])

        const axisE3 = makeTestAxis({ name: 'e' });
        const axisD3 = makeTestAxis({ name: 'd' });
        const axisC3 = makeTestAxis({ name: 'c', parents: [axisD3]});
        const axisB3 = makeTestAxis({ name: 'b', parents: [axisC3] });
        const axisA3 = makeTestAxis({ name: 'a', parents: [axisB3] });
        const normalized6 = getNormalizedAxesList([axisE3, axisD3, axisC3, axisB3, axisA3]);
        
        compareAxesLists(normalized5, normalized6);
    })

    test('Denormalization of axes list', () => {
        const sourceAxesList = [
            makeTestAxisWithParentIdxs({ name: 'e' }),
            makeTestAxisWithParentIdxs({ name: 'd' }),
            makeTestAxisWithParentIdxs({ name: 'c', parents: [1] }), // parent D
            makeTestAxisWithParentIdxs({ name: 'b', parents: [2] }), // parent C
            makeTestAxisWithParentIdxs({ name: 'a', parents: [3] })  // parent B
        ];
        const normalized = getNormalizedAxesList(sourceAxesList);
        const denormalized = getDenormalizedAxesList(normalized);

        sourceAxesList.forEach((el1, idx) => {
            const el2 = denormalized[idx];
            const id1 = canonicalizeJson(getAxisId(el1));
            const id2 = canonicalizeJson(getAxisId(el2));
            expect(id1).toEqual(id2);
            expect(el1.parentAxes).toEqual(el2.parentAxes);
        });
    })
});
