import { ProjectStructure } from './project_model';
import { graphDiff, productionGraph, stagingGraph } from './project_model_util';
import { outputRef } from './args';
import { PlRef } from '@platforma-sdk/model';

function toRefs(...ids: string[]): PlRef[] {
  return ids.map((id) => outputRef(id, ''));
}

function simpleStructure(...ids: string[]): ProjectStructure {
  return {
    groups: [
      {
        id: 'g1',
        label: 'G1',
        blocks: ids.map((id) => ({ id: id, label: id, renderingMode: 'Heavy' }))
      }
    ]
  };
}

describe('simple traverse', () => {
  const struct1: ProjectStructure = simpleStructure('b1', 'b2', 'b3', 'b4', 'b5', 'b6');
  const inputs = new Map<string, PlRef[]>();
  inputs.set('b2', toRefs('b1'));
  inputs.set('b4', toRefs('b3'));
  inputs.set('b5', toRefs('b4'));
  inputs.set('b6', toRefs('b2', 'b4'));
  const pGraph1 = productionGraph(struct1, (id) => inputs.get(id) ?? null);

  test.each([
    { roots: ['b2'], expectedDirectUpstreams: ['b1'], expectedDirectDownstreams: ['b6'], expectedUpstreams: ['b1'], expectedDownstreams: ['b6'] },
    { roots: ['b4'], expectedDirectUpstreams: ['b3'], expectedDirectDownstreams: ['b5', 'b6'], expectedUpstreams: ['b3'], expectedDownstreams: ['b5', 'b6'] },
    { roots: ['b5'], expectedDirectUpstreams: ['b3', 'b4'], expectedDirectDownstreams: [], expectedUpstreams: ['b3', 'b4'], expectedDownstreams: ['b6'] },
    { roots: ['b6'], expectedDirectUpstreams: ['b1', 'b2', 'b3', 'b4'], expectedDirectDownstreams: [], expectedUpstreams: ['b1', 'b2', 'b3', 'b4', 'b5'], expectedDownstreams: [] }
  ])('$roots', ({ roots, expectedDirectUpstreams, expectedDirectDownstreams, expectedUpstreams, expectedDownstreams }) => {
    const directUpstreams = pGraph1.traverseIdsExcludingRoots('directUpstream', ...roots);
    const directDownstreams = pGraph1.traverseIdsExcludingRoots('directDownstream', ...roots);
    const upstreams = pGraph1.traverseIdsExcludingRoots('upstream', ...roots);  
    const downstreams = pGraph1.traverseIdsExcludingRoots('downstream', ...roots);
    expect([...directUpstreams].sort()).toEqual(expectedDirectUpstreams.sort());
    expect([...directDownstreams].sort()).toEqual(expectedDirectDownstreams.sort());
    expect([...upstreams].sort()).toEqual(expectedUpstreams.sort());
    expect([...downstreams].sort()).toEqual(expectedDownstreams.sort());
  });
});

describe('simple diff', () => {
  const struct1: ProjectStructure = simpleStructure('b1', 'b2', 'b3', 'b4');
  const inputs = new Map<string, PlRef[]>();
  inputs.set('b2', toRefs('b1'));
  inputs.set('b4', toRefs('b3'));
  const sGraph1 = stagingGraph(struct1);
  const pGraph1 = productionGraph(struct1, (id) => inputs.get(id) ?? null);

  test.each([
    { struct2a: ['b1', 'b2', 'b3', 'b4'], expectedS: [], expectedP: [] },
    { struct2a: ['b1', 'b2', 'b4'], expectedS: ['b4'], expectedP: ['b4'], onlyA: ['b3'] },
    { struct2a: ['b1', 'b2', 'b4', 'b3'], expectedS: ['b3', 'b4'], expectedP: ['b4'] },
    { struct2a: ['b1', 'b4', 'b2', 'b3'], expectedS: ['b2', 'b3', 'b4'], expectedP: ['b4'] },
    { struct2a: ['b4', 'b1', 'b2', 'b3'], expectedS: ['b1', 'b2', 'b3', 'b4'], expectedP: ['b4'] },
    {
      struct2a: ['b4', 'b2', 'b1', 'b3'],
      expectedS: ['b1', 'b2', 'b3', 'b4'],
      expectedP: ['b2', 'b4']
    },
    {
      struct2a: ['b1', 'b2', 'b4', 'b3', 'b5'],
      expectedS: ['b3', 'b4'],
      expectedP: ['b4'],
      onlyB: ['b5']
    },
    {
      struct2a: ['b2', 'b1', 'b3'],
      expectedS: ['b1', 'b2', 'b3'],
      expectedP: ['b2'],
      onlyA: ['b4']
    }
  ])('$struct2a', ({ struct2a, expectedS, expectedP, onlyA, onlyB }) => {
    const struct2: ProjectStructure = simpleStructure(...struct2a);
    const sGraph2 = stagingGraph(struct2);
    const pGraph2 = productionGraph(struct2, (id) => inputs.get(id) ?? null);
    const sDiff = graphDiff(sGraph1, sGraph2);
    const pDiff = graphDiff(pGraph1, pGraph2);
    expect(sDiff.onlyInA).toEqual(new Set(onlyA ?? []));
    expect(sDiff.onlyInB).toEqual(new Set(onlyB ?? []));
    expect(sDiff.different).toEqual(new Set(expectedS));
    expect(pDiff.onlyInA).toEqual(new Set(onlyA ?? []));
    expect(pDiff.onlyInB).toEqual(new Set(onlyB ?? []));
    expect(pDiff.different).toEqual(new Set(expectedP));
  });
});
