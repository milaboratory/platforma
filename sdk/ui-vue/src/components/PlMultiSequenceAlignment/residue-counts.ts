import type { ResidueCounts } from './types';

export function getResidueCounts(
  alignedSequences: string[],
): ResidueCounts {
  const columns: ResidueCounts = [];
  for (const sequence of alignedSequences) {
    for (const [columnIndex, residue] of sequence.split('').entries()) {
      const column = columns[columnIndex] ??= {};
      column[residue] = (column[residue] ?? 0) + 1;
    }
  }
  return columns;
}

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;

  test('getAlignmentStats', () => {
    const alignedSequences = [
      'GKGDPKKPRG-KMSSYAFFVQTSREEHKKKHPDASVNFSEFSKKCSERWKTMSAKEKGKFEDMAKADKARYEREMKTY-IPPKGE---------',
      '-----MQDRV-KRPMNAFIVWSRDQRRKMALENPRMRNSEISKQLGYQWKMLTEAEKWPFFQEAQKLQAMHREKYPNYKYRPRRKAKMLPK---',
      'MKKLKKHPDFPKKPLTPYFRFFMEKRAKYAKLHPEMSNLDLTKILSKKYKELPEKKKMKYIQDFQREKQ-EFERNLARFREDHPDLIQNAKK--',
      '-----MHI---KKPLNAFMLYMKEMRANVVAESTLKESAAINQILGRRWHALSREEQAKYYELARKERQLHMQLYPGWSARDNYGKKKKRKREK',
    ];

    expect(getResidueCounts(alignedSequences)).toEqual([
      { '-': 2, 'G': 1, 'M': 1 },
      { '-': 2, 'K': 2 },
      { '-': 2, 'G': 1, 'K': 1 },
      { '-': 2, 'D': 1, 'L': 1 },
      { '-': 2, 'K': 1, 'P': 1 },
      { K: 2, M: 2 },
      { H: 2, K: 1, Q: 1 },
      { D: 1, I: 1, P: 2 },
      { '-': 1, 'D': 1, 'R': 2 },
      { '-': 1, 'F': 1, 'G': 1, 'V': 1 },
      { '-': 3, 'P': 1 },
      { K: 4 },
      { K: 2, M: 1, R: 1 },
      { P: 3, S: 1 },
      { L: 2, M: 1, S: 1 },
      { N: 2, T: 1, Y: 1 },
      { A: 3, P: 1 },
      { F: 3, Y: 1 },
      { F: 2, I: 1, M: 1 },
      { L: 1, R: 1, V: 2 },
      { F: 1, Q: 1, W: 1, Y: 1 },
      { F: 1, M: 1, S: 1, T: 1 },
      { K: 1, M: 1, R: 1, S: 1 },
      { D: 1, E: 2, R: 1 },
      { E: 1, K: 1, M: 1, Q: 1 },
      { E: 1, R: 3 },
      { A: 2, H: 1, R: 1 },
      { K: 3, N: 1 },
      { K: 1, M: 1, V: 1, Y: 1 },
      { A: 2, K: 1, V: 1 },
      { A: 1, H: 1, K: 1, L: 1 },
      { E: 2, L: 1, P: 1 },
      { D: 1, H: 1, N: 1, S: 1 },
      { A: 1, P: 2, T: 1 },
      { E: 1, L: 1, R: 1, S: 1 },
      { K: 1, M: 2, V: 1 },
      { E: 1, N: 1, R: 1, S: 1 },
      { F: 1, N: 2, S: 1 },
      { A: 1, L: 1, S: 2 },
      { A: 1, D: 1, E: 2 },
      { F: 1, I: 2, L: 1 },
      { N: 1, S: 2, T: 1 },
      { K: 3, Q: 1 },
      { I: 2, K: 1, Q: 1 },
      { C: 1, L: 3 },
      { G: 2, S: 2 },
      { E: 1, K: 1, R: 1, Y: 1 },
      { K: 1, Q: 1, R: 2 },
      { W: 3, Y: 1 },
      { H: 1, K: 3 },
      { A: 1, E: 1, M: 1, T: 1 },
      { L: 3, M: 1 },
      { P: 1, S: 2, T: 1 },
      { A: 1, E: 2, R: 1 },
      { A: 1, E: 1, K: 2 },
      { E: 3, K: 1 },
      { K: 3, Q: 1 },
      { A: 1, G: 1, M: 1, W: 1 },
      { K: 3, P: 1 },
      { F: 2, Y: 2 },
      { E: 1, F: 1, I: 1, Y: 1 },
      { D: 1, E: 1, Q: 2 },
      { D: 1, E: 1, L: 1, M: 1 },
      { A: 3, F: 1 },
      { K: 1, Q: 2, R: 1 },
      { A: 1, K: 2, R: 1 },
      { D: 1, E: 2, L: 1 },
      { K: 2, Q: 1, R: 1 },
      { A: 2, Q: 2 },
      { '-': 1, 'L': 1, 'M': 1, 'R': 1 },
      { E: 1, H: 2, Y: 1 },
      { E: 1, F: 1, M: 1, R: 1 },
      { E: 2, Q: 1, R: 1 },
      { E: 1, K: 1, L: 1, R: 1 },
      { M: 1, N: 1, Y: 2 },
      { K: 1, L: 1, P: 2 },
      { A: 1, G: 1, N: 1, T: 1 },
      { R: 1, W: 1, Y: 2 },
      { '-': 1, 'F': 1, 'K': 1, 'S': 1 },
      { A: 1, I: 1, R: 1, Y: 1 },
      { E: 1, P: 1, R: 2 },
      { D: 2, P: 2 },
      { H: 1, K: 1, N: 1, R: 1 },
      { G: 1, P: 1, R: 1, Y: 1 },
      { D: 1, E: 1, G: 1, K: 1 },
      { '-': 1, 'A': 1, 'K': 1, 'L': 1 },
      { '-': 1, 'I': 1, 'K': 2 },
      { '-': 1, 'K': 1, 'M': 1, 'Q': 1 },
      { '-': 1, 'K': 1, 'L': 1, 'N': 1 },
      { '-': 1, 'A': 1, 'P': 1, 'R': 1 },
      { '-': 1, 'K': 3 },
      { '-': 2, 'K': 1, 'R': 1 },
      { '-': 3, 'E': 1 },
      { '-': 3, 'K': 1 },
    ]);
  });
}
