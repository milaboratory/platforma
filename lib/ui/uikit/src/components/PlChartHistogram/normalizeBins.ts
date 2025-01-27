import type { AnyBin, BinLike } from './types';

export function normalizeBins(bins: (d3.Bin<number, number> | AnyBin)[]): BinLike[] {
  return bins.map((it) => {
    if ('from' in it) {
      return {
        x0: it.from,
        x1: it.to,
        length: it.weight,
      };
    }

    return {
      x0: it.x0!,
      x1: it.x1!,
      length: it.length,
    };
  });
}
