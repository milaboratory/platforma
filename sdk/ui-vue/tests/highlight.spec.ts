import { test } from 'vitest';
import { iterateByPairs } from '@milaboratory/helpers/collections';

test('Highlight', async () => {
  const data = {
    anchorPoints: {
      FR3EndCDR3Begin: 0,
      VEndTrimmed: 3,
      DBeginTrimmed: 4,
      DEnd: 9,
      DEndTrimmed: 9,
      JBeginTrimmed: 11,
      CDR3EndFR4Begin: 16,
    },
    sequence: 'CAREGSGSSGGAFDIW',
  };

  const intervals = Object.entries(data.anchorPoints); // .sort((a, b) => a[1] > b[1] ? 1 : -1);

  const anchors = intervals.map(([name, point]) => {
    return { name, point };
  });

  const chunks: {
    name: string;
    seq: string;
    length: number;
  }[] = [];

  for (const [from, to] of iterateByPairs(anchors)) {
    chunks.push({
      name: `${from.name}-${to.name}`,
      length: to.point - from.point,
      seq: data.sequence.substring(from.point, to.point),
    });
  }
});
