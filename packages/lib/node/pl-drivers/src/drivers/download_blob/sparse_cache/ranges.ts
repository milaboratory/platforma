import { z } from "zod";
import * as fs from "node:fs/promises";
import { RangeBytes } from "@milaboratories/pl-model-common";
import { createPathAtomically, MiLogger } from "@milaboratories/ts-helpers";
import { CorruptedRangesError } from "./cache";

/** The content of the ranges file: ranges of bytes.
 * The ranges should be normalized: sorted and no overlaps.
 * For that, use `normalizeRanges` function. */
const Ranges = z.object({
  ranges: z.array(RangeBytes),
});

export type Ranges = z.infer<typeof Ranges>;

export const rangesFilePostfix = ".ranges.json";

export function rangesFileName(fPath: string): string {
  return fPath + rangesFilePostfix;
}

export async function readRangesFile(logger: MiLogger, path: string): Promise<Ranges> {
  let ranges: Ranges = { ranges: [] };
  try {
    const file = await fs.readFile(path, "utf8");
    ranges = Ranges.parse(JSON.parse(file));
  } catch (e: unknown) {
    if (e instanceof SyntaxError || e instanceof z.ZodError) {
      const msg = `readRangesFile: the file ${path} was corrupted: ${e}`;
      logger.error(msg);
      throw new CorruptedRangesError(msg);
    }

    if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) {
      throw e;
    }

    // If the file does not exist, assume the ranges are empty.
  }

  normalizeRanges(ranges);

  return ranges;
}

/** Writes to a temporal file and then renames it atomically. */
export async function writeRangesFile(logger: MiLogger, path: string, ranges: Ranges) {
  await createPathAtomically(logger, path, async (tempPath: string) => {
    await fs.writeFile(tempPath, JSON.stringify(ranges, null, 2), { flag: "wx" });
  });
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
}

function mergeRanges(s: Ranges, i: number) {
  const from = Math.min(s.ranges[i].from, s.ranges[i + 1].from);
  const to = Math.max(s.ranges[i].to, s.ranges[i + 1].to);

  s.ranges.splice(i, 2, { from, to });
}

export function rangesSize(s: Ranges) {
  return s.ranges.reduce((acc, range) => acc + range.to - range.from, 0);
}

export function doesRangeExist(allRanges: Ranges, range: RangeBytes): boolean {
  for (const r of allRanges.ranges) {
    if (r.from <= range.from && range.to <= r.to) {
      return true;
    }
  }

  return false;
}

export function addRange(s: Ranges, range: RangeBytes) {
  s.ranges.push(range);
  normalizeRanges(s);

  return s;
}
