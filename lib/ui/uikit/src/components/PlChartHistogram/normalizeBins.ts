import type { AnyBin, BinLike } from "./types";
import type { Bin } from "d3-array";

export function normalizeBins(bins: (Bin<number, number> | AnyBin)[]): BinLike[] {
  return bins.map((it) => {
    if ("from" in it) {
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
