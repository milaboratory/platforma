import { z } from "zod";
import * as fs from 'node:fs/promises';
import { RangeBytes } from "@milaboratories/pl-model-common";
import { MiLogger } from "@milaboratories/ts-helpers";

/** The content of the ranges file: ranges of bytes.
 * The ranges should be normalized: sorted and no overlaps.
 * For that, use `normalizeRanges` function. */
const Ranges = z.object({
  ranges: z.array(RangeBytes),
});

export type Ranges = z.infer<typeof Ranges>;

export const rangesFilePostfix = '.ranges.json';

export function rangesFileName(fPath: string): string {
  return fPath + rangesFilePostfix;
}

export async function readRangesFile(logger: MiLogger, path: string): Promise<Ranges> {
  let ranges: Ranges = { ranges: [] };
  try {
    const file = await fs.readFile(path, 'utf8');
    ranges = Ranges.parse(JSON.parse(file));
  } catch (e: unknown) {
    if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) {
      throw e;
    }
    // If the file does not exist, assume the ranges are empty.
  }

  return normalizeRanges(ranges);
}

export async function writeRangesFile(path: string, ranges: Ranges) {
  await fs.writeFile(path, JSON.stringify(ranges, null, 2));
}

/** Sorts and merges overlapping ranges. */
export function normalizeRanges(s: Ranges) {
  s.ranges.sort((a, b) => a.from - b.from);

  for (let i = 0; i < s.ranges.length - 1; i++) {
    if (s.ranges[i].to >= s.ranges[i + 1].from) {
      mergeRanges(s, i);
      i--;
    }
  }

  return s;
}

export function mergeRanges(s: Ranges, i: number) {
  const from = Math.min(s.ranges[i].from, s.ranges[i + 1].from);
  const to = Math.max(s.ranges[i].to, s.ranges[i + 1].to);

  s.ranges.splice(i, 2, { from, to });

  return s;
}

export function rangesSize(s: Ranges) {
  return s.ranges.reduce((acc, range) => acc + range.to - range.from, 0);
}

export function existRange(allRanges: Ranges, range: RangeBytes): boolean {
  for (const r of allRanges.ranges) {
    if (r.from <= range.from && range.to <= r.to) {
      return true;
    }
  }

  return false;
}

export function addRange(s: Ranges, range: RangeBytes) {
  s.ranges.push(range);
  return normalizeRanges(s);
}

