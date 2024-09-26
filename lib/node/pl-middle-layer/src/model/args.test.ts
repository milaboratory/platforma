import { test, expect } from '@jest/globals';
import { inferAllReferencedBlocks, outputRef, excludeDuplicatedUpstreams } from './args';

test('infer all referenced blocks, should get all referenced blocks with arrays of refs', () => {
  const ref1 = outputRef('1', 'abc');
  const ref2 = outputRef('2', 'cde');
  const upstreams = inferAllReferencedBlocks({
    arg1: ref1,
    arrayOfArgs2: [ref1, ref2],
    number: 3
  })

  expect(upstreams.upstreams).toEqual(new Set(['1', '2']));
  expect(upstreams.missingReferences).toBeFalsy();
})

test('exclude deduplicated upstreams, should exclude loops from the graph of upstreams', () => {
  const previousUpstreams = new Map<string, {upstream: Set<string>}>(
    [['1', {upstream: new Set()}],
     ['2', {upstream: new Set(['1'])}]]);

  const upstreams = new Set(['1', '2']);
  excludeDuplicatedUpstreams(upstreams, previousUpstreams);

  expect(upstreams).toEqual(new Set(['2']));
})

test('exclude deduplicated upstreams, should exclude all possible loops', () => {
  const previousUpstreams = new Map<string, {upstream: Set<string>}>(
    [['1', {upstream: new Set()}],
     ['2', {upstream: new Set(['1'])}],
     ['3', {upstream: new Set(['2'])}],
     ['4', {upstream: new Set()}]]);

  const upstreams = new Set(['1', '2', '3', '4']);
  excludeDuplicatedUpstreams(upstreams, previousUpstreams);

  expect(upstreams).toEqual(new Set(['3', '4']));
})
