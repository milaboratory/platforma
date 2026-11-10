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

function runSplit(
  root: string,
  out: string,
  bins: number,
  minTarget: number,
  keep: string[] = [],
  env: NodeJS.ProcessEnv = {},
) {
  const result = spawnSync("python3", ["-", root, out, String(bins), String(minTarget), ...keep], {
    input: script,
    encoding: "utf-8",
    env: { ...process.env, ...env },
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

  /** Index of the bin that holds root-relative path f, or undefined. */
  function binOf(f: string, bins: number): number | undefined {
    return Array.from({ length: bins }, (_, i) => i).find((i) =>
      fs.existsSync(path.join(out, String(i)) + path.join(root, f)),
    );
  }

  it("creates every bin, empty or not, and keeps all files", () => {
    writeFile(path.join(root, "lib/site-packages/a/x.py"), 100);
    writeFile(path.join(root, "bin/tool"), 10);

    runSplit(root, out, 4, 1000);

    expect(fs.readdirSync(out).sort()).toEqual(["0", "1", "2", "3"]);
    expect(mergedFiles(4)).toEqual(["bin/tool", "lib/site-packages/a/x.py"]);
  });

  it("keeps a package and its dist-info in the same bin", () => {
    for (const pkg of ["numpy", "pandas", "scipy", "torch"]) {
      writeFile(path.join(root, "lib/site-packages", pkg, "__init__.py"), 50);
      writeFile(path.join(root, "lib/site-packages", `${pkg}-1.2.3.dist-info/RECORD`), 10);
    }

    runSplit(root, out, 8, 1000);

    for (const pkg of ["numpy", "pandas", "scipy", "torch"]) {
      expect(binOf(`lib/site-packages/${pkg}-1.2.3.dist-info`, 8)).toBe(
        binOf(`lib/site-packages/${pkg}`, 8),
      );
    }
  });

  it("keeps unchanged packages in byte-identical bins when one package is bumped", () => {
    const pkgs = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const install = (bumped: boolean) => {
      fs.rmSync(path.join(tmp, "usr"), { recursive: true, force: true });
      fs.rmSync(out, { recursive: true, force: true });
      for (const pkg of pkgs) {
        const version = bumped && pkg === "c" ? "2.0" : "1.0";
        writeFile(
          path.join(root, "lib/site-packages", pkg, "m.so"),
          bumped && pkg === "c" ? 70 : 50,
        );
        writeFile(path.join(root, "lib/site-packages", `${pkg}-${version}.dist-info/RECORD`), 5);
      }
      runSplit(root, out, 8, 1000);
      return Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => {
          const dir = path.join(out, String(i));
          return [i, listFiles(dir).map((f) => `${f}:${fs.statSync(path.join(dir, f)).mtimeMs}`)];
        }),
      );
    };

    const before = install(false);
    const after = install(true);
    const changed = Object.keys(before).filter(
      (i) => JSON.stringify(before[i]) !== JSON.stringify(after[i]),
    );
    // only the bin holding package c differs
    expect(changed).toHaveLength(1);
  });

  it("sets every moved entry to SOURCE_DATE_EPOCH", () => {
    writeFile(path.join(root, "lib/site-packages/a/x.py"), 10);
    fs.symlinkSync("x.py", path.join(root, "lib/site-packages/a/y.py"));

    runSplit(root, out, 2, 1000, [], { SOURCE_DATE_EPOCH: "1234" });

    const bin = binOf("lib/site-packages/a", 2);
    const base = path.join(out, String(bin)) + root;
    for (const rel of ["", "lib", "lib/site-packages/a", "lib/site-packages/a/x.py"]) {
      expect(fs.lstatSync(path.join(base, rel)).mtimeMs).toBe(1234000);
    }
    expect(fs.lstatSync(path.join(base, "lib/site-packages/a/y.py")).mtimeMs).toBe(1234000);
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

    // total 3010 bytes, 4 bins, target 500: package dirs (600) are split into files (300).
    // Capacity 2000 < 3010, so files that fit no bin go to the least-filled one: a bin
    // ends at most one file (300) above the average (753).
    runSplit(root, out, 4, 500);

    expect(mergedFiles(4)).toEqual(before.sort());
    const loads = [0, 1, 2, 3].map((i) => dirBytes(path.join(out, String(i))));
    expect(loads.reduce((a, b) => a + b, 0)).toBe(3010);
    for (const load of loads) {
      expect(load).toBeLessThanOrEqual(753 + 300);
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

    const linkBin = path.join(out, String(binOf("bin/python3", 2))) + root;
    expect(fs.readlinkSync(path.join(linkBin, "bin/python3"))).toBe("python3.12");
    const emptyBin = path.join(out, String(binOf("share/empty", 2))) + root;
    expect(fs.statSync(path.join(emptyBin, "share/empty")).isDirectory()).toBe(true);
  });

  it("leaves the kept stdlib in place but moves its site-packages", () => {
    const stdlib = path.join(root, "lib/python3.12");
    writeFile(path.join(stdlib, "os.py"), 100);
    writeFile(path.join(stdlib, "site-packages/numpy/core.so"), 500);
    writeFile(path.join(root, "bin/f2py"), 10);

    runSplit(root, out, 2, 1000, [stdlib, path.join(stdlib, "site-packages")]);

    expect(fs.existsSync(path.join(stdlib, "os.py"))).toBe(true);
    expect(fs.existsSync(path.join(stdlib, "site-packages"))).toBe(false);
    expect(mergedFiles(2)).toEqual(["bin/f2py", "lib/python3.12/site-packages/numpy/core.so"]);
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
