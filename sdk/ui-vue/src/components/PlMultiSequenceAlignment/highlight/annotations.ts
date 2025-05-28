import type { Annotation } from '../types';

export function annotateAlignedRow(
  alignedSequence: string,
  annotations: Annotation[],
): { id: string; start: number; end: number }[] {
  const emptyPositions = alignedSequence.split('')
    .reduce<number[]>((acc, char, index) => {
      if (char === '-') acc.push(index - acc.length);
      return acc;
    }, []);
  return annotations.map(({ id, start, length }) => {
    const end = start + length;
    const emptyBeforeStart = binaryInsertPosition(emptyPositions, start);
    const emptyBeforeEnd = binaryInsertPosition(emptyPositions, end);
    return ({ id, start: start + emptyBeforeStart, end: end + emptyBeforeEnd });
  });
}

function binaryInsertPosition(arr: number[], val: number): number {
  let start = 0;
  let end = arr.length - 1;
  let mid = Math.floor((start + end) / 2);
  while (start <= end) {
    if (arr[mid] === val) break;
    if (val < arr[mid]) end = mid - 1;
    else start = mid + 1;
    mid = Math.floor((start + end) / 2);
  }
  return mid + 1;
}

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;
  test('annotateAlignedRow', () => {
    const alignedSequence
      = 'EVLLVESGGGLVRPGGSLRLSCEASGFTFSSHWMTWVRQVPGKGLEWVANIKQDGSEKYYVDSVKGRFTISRDNARDSLYLQMNNLRAEDSGVFYCARAYYY---ESSGL---AYWGQGTLVTVSS';
    //   0         10        20        30        40        50        60        70        80        90        100       110       120
    const sourceSequence = alignedSequence.replace(/-/g, '');
    const annotations = [
      { id: '1', start: 25, length: 8 },
      { id: '2', start: 50, length: 8 },
      { id: '3', start: 95, length: 15 },
      { id: '4', start: 109, length: 1 },
      { id: '4', start: 32, length: 1 },
      { id: '5', start: 53, length: 2 },
    ];
    expect(
      annotateAlignedRow(alignedSequence, annotations).map((
        { id, start, end },
      ) => [id, alignedSequence.slice(start, end).replace(/-/g, '')]),
    ).toEqual(
      annotations.map((
        { id, start, length },
      ) => [id, sourceSequence.slice(start, start + length)]),
    );
  });
}
