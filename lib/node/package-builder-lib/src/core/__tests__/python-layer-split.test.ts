import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as paths from "../paths";

// Runs assets/python-layer-split.py the way the generated Dockerfile does
// (`python3 - <root> <out> <bins> <min_target>` with the script on stdin).

const hasPython = spawnSync("python3", ["--version"]).status === 0;
const script = fs.readFileSync(paths.assets("python-layer-split.py"), "utf-8");

function runSplit(root: string, out: string, bins: number, minTarget: number) {
  const result = spawnSync("python3", ["-", root, out, String(bins), String(minTarget)], {
    input: script,
    encoding: "utf-8",
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout;
}

function writeFile(file: string, bytes: number) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.alloc(bytes, 1));
}

/** Relative paths of all files and symlinks under dir (directories excluded). */
function listFiles(dir: string, prefix = ""): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? listFiles(path.join(dir, e.name), path.join(prefix, e.name))
        : [path.join(prefix, e.name)],
    )
    .sort();
}

/** Total bytes of regular files under dir. */
function dirBytes(dir: string): number {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sum + dirBytes(p);
    if (e.isFile()) return sum + fs.statSync(p).size;
    return sum;
  }, 0);
}

describe.skipIf(!hasPython)("python-layer-split.py", () => {
  let tmp: string;
  let root: string;
  let out: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "layer-split-"));
    root = path.join(tmp, "usr", "local");
    out = path.join(tmp, "layers");
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function mergedFiles(bins: number): string[] {
    return Array.from({ length: bins }, (_, i) => {
      const binRoot = path.join(out, String(i)) + root;
      return fs.existsSync(binRoot) ? listFiles(binRoot) : [];
    })
      .flat()
      .sort();
  }

  it("keeps a tree smaller than the target in bin 0 and creates every bin", () => {
    writeFile(path.join(root, "lib/site-packages/a/x.py"), 100);
    writeFile(path.join(root, "bin/tool"), 10);

    runSplit(root, out, 4, 1000);

    expect(fs.readdirSync(out).sort()).toEqual(["0", "1", "2", "3"]);
    expect(listFiles(path.join(out, "0") + root)).toEqual(["bin/tool", "lib/site-packages/a/x.py"]);
    for (const i of [1, 2, 3]) {
      expect(fs.readdirSync(path.join(out, String(i)))).toEqual([]);
    }
  });

  it("splits a big tree across bins without losing or duplicating files", () => {
    const before: string[] = [];
    for (const pkg of ["a", "b", "c", "d", "e"]) {
      for (const f of ["1.so", "2.so"]) {
        writeFile(path.join(root, "lib/site-packages", pkg, f), 300);
        before.push(path.join("lib/site-packages", pkg, f));
      }
    }
    writeFile(path.join(root, "bin/tool"), 10);
    before.push("bin/tool");

    // total 3010 bytes, 4 bins, min target 500 -> target 753. Package dirs (600) fit no
    // bin once four are placed, so the fifth is placed file by file: a bin may exceed the
    // target by less than one file (300).
    runSplit(root, out, 4, 500);

    expect(mergedFiles(4)).toEqual(before.sort());
    const loads = [0, 1, 2, 3].map((i) => dirBytes(path.join(out, String(i))));
    expect(loads.reduce((a, b) => a + b, 0)).toBe(3010);
    for (const load of loads) {
      expect(load).toBeLessThan(753 + 300);
    }
  });

  it("descends into a directory bigger than the target", () => {
    // one package bigger than the target: its files must land in different bins
    writeFile(path.join(root, "lib/site-packages/huge/part1.bin"), 600);
    writeFile(path.join(root, "lib/site-packages/huge/part2.bin"), 600);

    runSplit(root, out, 2, 600);

    const binOf = (f: string) =>
      [0, 1].find((i) => fs.existsSync(path.join(out, String(i)) + path.join(root, f)));
    expect(binOf("lib/site-packages/huge/part1.bin")).not.toBe(
      binOf("lib/site-packages/huge/part2.bin"),
    );
  });

  it("keeps symlinks as symlinks and empty directories", () => {
    writeFile(path.join(root, "bin/python3.12"), 10);
    fs.symlinkSync("python3.12", path.join(root, "bin/python3"));
    fs.mkdirSync(path.join(root, "share/empty"), { recursive: true });

    runSplit(root, out, 2, 1000);

    const bin0 = path.join(out, "0") + root;
    expect(fs.readlinkSync(path.join(bin0, "bin/python3"))).toBe("python3.12");
    expect(fs.statSync(path.join(bin0, "share/empty")).isDirectory()).toBe(true);
  });

  it("copies directory modes of split parents", () => {
    writeFile(path.join(root, "lib/pkg/a.bin"), 600);
    writeFile(path.join(root, "lib/pkg/b.bin"), 600);
    fs.chmodSync(path.join(root, "lib/pkg"), 0o750);

    runSplit(root, out, 2, 600);

    for (const i of [0, 1]) {
      const dir = path.join(out, String(i)) + path.join(root, "lib/pkg");
      expect(fs.statSync(dir).mode & 0o777).toBe(0o750);
    }
  });
});
