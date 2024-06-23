import { ProjectStructure } from './project_model';
import { graphDiff, productionGraph, stagingGraph } from './project_model_util';
import { outputRef } from './args';
import { Ref } from '@milaboratory/sdk-ui';

function toRefs(...ids: string[]): Ref[] {
  return ids.map(id => (outputRef(id, '')));
}

function simpleStructure(...ids: string[]): ProjectStructure {
  return {
    groups: [
      {
        id: 'g1', label: 'G1',
        blocks: ids.map(id => ({ id: id, label: id, renderingMode: 'Heavy' }))
      }
    ]
  };
}


describe('simple examples', () => {
  const struct1: ProjectStructure = simpleStructure('b1', 'b2', 'b3', 'b4');
  const inputs = new Map<string, Ref[]>();
  inputs.set('b2', toRefs('b1'));
  inputs.set('b4', toRefs('b3'));
  const sGraph1 = stagingGraph(struct1);
  const pGraph1 = productionGraph(struct1, id => inputs.get(id) ?? null);

  test.each([
    { struct2a: ['b1', 'b2', 'b3', 'b4'], expectedS: [], expectedP: [] },
    { struct2a: ['b1', 'b2', 'b4'], expectedS: ['b4'], expectedP: ['b4'], onlyA: ['b3'] },
    { struct2a: ['b1', 'b2', 'b4', 'b3'], expectedS: ['b3', 'b4'], expectedP: ['b4'] },
    { struct2a: ['b1', 'b4', 'b2', 'b3'], expectedS: ['b2', 'b3', 'b4'], expectedP: ['b4'] },
    { struct2a: ['b4', 'b1', 'b2', 'b3'], expectedS: ['b1', 'b2', 'b3', 'b4'], expectedP: ['b4'] },
    { struct2a: ['b4', 'b2', 'b1', 'b3'], expectedS: ['b1', 'b2', 'b3', 'b4'], expectedP: ['b2', 'b4'] },
    { struct2a: ['b1', 'b2', 'b4', 'b3', 'b5'], expectedS: ['b3', 'b4'], expectedP: ['b4'], onlyB: ['b5'] },
    { struct2a: ['b2', 'b1', 'b3'], expectedS: ['b1', 'b2', 'b3'], expectedP: ['b2'], onlyA: ['b4'] }
  ])('$struct2a', ({ struct2a, expectedS, expectedP, onlyA, onlyB }) => {
    const struct2: ProjectStructure = simpleStructure(...struct2a);
    const sGraph2 = stagingGraph(struct2);
    const pGraph2 = productionGraph(struct2, id => inputs.get(id) ?? null);
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

