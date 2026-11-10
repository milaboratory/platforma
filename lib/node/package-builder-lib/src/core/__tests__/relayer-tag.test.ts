import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as paths from "../paths";

// Runs assets/relayer-tag.py the way docker-relayer.ts does
// (`python3 - <rootfs> <app_dir> <max_bytes>` with the script on stdin), in --dry-run mode,
// which prints "<path>\t<component>" instead of writing xattrs.

const hasPython = spawnSync("python3", ["--version"]).status === 0;
const script = fs.readFileSync(paths.assets("relayer-tag.py"), "utf-8");

describe.skipIf(!hasPython)("relayer-tag.py", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "relayer-tag-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function file(rel: string, bytes = 10) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.alloc(bytes, 1));
  }

  function components(appDir = "/app", maxBytes = 1000): Record<string, string> {
    const result = spawnSync("python3", ["-", root, appDir, String(maxBytes), "--dry-run"], {
      input: script,
      encoding: "utf-8",
    });
    expect(result.status, result.stderr).toBe(0);
    return Object.fromEntries(
      lines(result.stdout)
        .filter(([, comp]) => comp !== "")
        .map(([p, comp]) => [p, comp]),
    );
  }

  /** [path, component, mtime] rows of a dry run. */
  function lines(stdout: string): [string, string, string][] {
    return stdout
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => {
        const [p, comp, mtime] = l.split("\t");
        return [p ?? "", comp ?? "", mtime ?? ""];
      });
  }

  const site = "usr/local/lib/python3.12/site-packages";

  it("groups a pip package with its dist-info, scripts and later-compiled .pyc", () => {
    file(`${site}/numpy/core.py`);
    file(`${site}/numpy/__pycache__/core.cpython-312.pyc`); // compiled after install: not in RECORD
    file(`${site}/six.py`);
    file(`${site}/__pycache__/six.cpython-312.pyc`);
    file("usr/local/bin/f2py");
    file(`${site}/numpy-2.1.3.dist-info/METADATA`);
    file(`${site}/six-1.16.0.dist-info/METADATA`);
    fs.writeFileSync(
      path.join(root, `${site}/numpy-2.1.3.dist-info/RECORD`),
      "numpy/core.py,sha256=x,10\n../../../bin/f2py,sha256=x,10\nnumpy-2.1.3.dist-info/RECORD,,\n",
    );
    fs.writeFileSync(
      path.join(root, `${site}/six-1.16.0.dist-info/RECORD`),
      "six.py,sha256=x,10\n",
    );

    const c = components();

    for (const p of [
      `/${site}/numpy/core.py`,
      `/${site}/numpy/__pycache__/core.cpython-312.pyc`,
      "/usr/local/bin/f2py",
      `/${site}/numpy-2.1.3.dist-info/METADATA`,
      `/${site}/numpy-2.1.3.dist-info/RECORD`,
    ]) {
      expect(c[p], p).toBe("pypi/numpy");
    }
    expect(c[`/${site}/six.py`]).toBe("pypi/six");
    expect(c[`/${site}/__pycache__/six.cpython-312.pyc`]).toBe("pypi/six");
  });

  it("uses dpkg lists and conda-meta, and pip wins over conda for the same file", () => {
    file("usr/bin/curl");
    file("var/lib/dpkg/status");
    fs.mkdirSync(path.join(root, "var/lib/dpkg/info"), { recursive: true });
    fs.writeFileSync(path.join(root, "var/lib/dpkg/info/curl.list"), "/.\n/usr\n/usr/bin/curl\n");
    file("opt/conda/lib/libz.so");
    file("opt/conda/lib/python3.12/site-packages/attr/__init__.py");
    fs.mkdirSync(path.join(root, "opt/conda/conda-meta"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "opt/conda/conda-meta/zlib-1.3-0.json"),
      JSON.stringify({ name: "zlib", files: ["lib/libz.so"] }),
    );
    fs.writeFileSync(
      path.join(root, "opt/conda/conda-meta/attrs-23.1-0.json"),
      JSON.stringify({ name: "attrs", files: ["lib/python3.12/site-packages/attr/__init__.py"] }),
    );
    fs.mkdirSync(path.join(root, "opt/conda/lib/python3.12/site-packages/attrs-23.1.dist-info"));
    fs.writeFileSync(
      path.join(root, "opt/conda/lib/python3.12/site-packages/attrs-23.1.dist-info/RECORD"),
      "attr/__init__.py,,\n",
    );

    const c = components();

    expect(c["/usr/bin/curl"]).toBe("deb/curl");
    expect(c["/var/lib/dpkg/status"]).toBe("deb/.db");
    expect(c["/opt/conda/lib/libz.so"]).toBe("conda/zlib");
    expect(c["/opt/conda/conda-meta/zlib-1.3-0.json"]).toBe("conda/zlib");
    expect(c["/opt/conda/lib/python3.12/site-packages/attr/__init__.py"]).toBe("pypi/attrs");
  });

  it("puts the image's own code in 'app' and the rest in directory groups", () => {
    file("app/main.py");
    file("app/requirements.txt");
    file("usr/share/doc/a/README");
    file("etc/hosts");

    const c = components("/app");

    expect(c["/app/main.py"]).toBe("app");
    expect(c["/app/requirements.txt"]).toBe("app");
    expect(c["/usr/share/doc/a/README"]).toBe("dir/usr/share/doc");
    expect(c["/etc/hosts"]).toBe("dir/etc");
  });

  it("splits a component above the size cap into parts, in path order", () => {
    for (const f of ["a.so", "b.so", "c.so", "d.so"]) file(`${site}/torch/lib/${f}`, 400);
    fs.mkdirSync(path.join(root, `${site}/torch-2.5.0.dist-info`));
    fs.writeFileSync(path.join(root, `${site}/torch-2.5.0.dist-info/RECORD`), "torch/lib/a.so,,\n");

    const c = components("/app", 1000);

    const lib = `/${site}/torch/lib`;
    expect([c[`${lib}/a.so`], c[`${lib}/b.so`], c[`${lib}/c.so`], c[`${lib}/d.so`]]).toEqual([
      "pypi/torch/part-0",
      "pypi/torch/part-0",
      "pypi/torch/part-1",
      "pypi/torch/part-1",
    ]);
  });

  it("leaves unowned files to chunkah when the image has an rpm database", () => {
    file("var/lib/rpm/rpmdb.sqlite");
    file("usr/bin/bash");
    file("app/main.py");

    const c = components("/app");

    expect(c["/usr/bin/bash"]).toBeUndefined();
    expect(c["/app/main.py"]).toBe("app");
  });

  it("ignores absolute RECORD entries instead of claiming all of site-packages", () => {
    file(`${site}/a/x.py`);
    file(`${site}/b/y.py`);
    fs.mkdirSync(path.join(root, `${site}/zz-1.0.dist-info`));
    fs.writeFileSync(path.join(root, `${site}/zz-1.0.dist-info/RECORD`), "/usr/share/zz,,\n");
    for (const pkg of ["a", "b"]) {
      fs.mkdirSync(path.join(root, `${site}/${pkg}-1.0.dist-info`));
      fs.writeFileSync(path.join(root, `${site}/${pkg}-1.0.dist-info/RECORD`), `${pkg}/x.py,,\n`);
    }

    const c = components();

    expect(c[`/${site}/a/x.py`]).toBe("pypi/a");
    expect(c[`/${site}/b/y.py`]).toBe("pypi/b");
  });

  it("keeps RECORD owners in a namespace directory that several distributions share", () => {
    file(`${site}/nvidia/cublas/lib/libcublas.so`);
    file(`${site}/nvidia/cudnn/lib/libcudnn.so`);
    for (const [dist, rel] of [
      ["nvidia_cublas_cu12-12.4", "nvidia/cublas/lib/libcublas.so"],
      ["nvidia_cudnn_cu12-9.1", "nvidia/cudnn/lib/libcudnn.so"],
    ] as const) {
      fs.mkdirSync(path.join(root, `${site}/${dist}.dist-info`));
      fs.writeFileSync(path.join(root, `${site}/${dist}.dist-info/RECORD`), `${rel},,\n`);
    }

    const c = components();

    expect(c[`/${site}/nvidia/cublas/lib/libcublas.so`]).toBe("pypi/nvidia_cublas_cu12");
    expect(c[`/${site}/nvidia/cudnn/lib/libcudnn.so`]).toBe("pypi/nvidia_cudnn_cu12");
  });

  it("keeps package owners of a venv under WORKDIR; only unowned files there are 'app'", () => {
    const venv = "app/.venv/lib/python3.12/site-packages";
    file(`${venv}/numpy/core.py`);
    file("app/main.py");
    fs.mkdirSync(path.join(root, `${venv}/numpy-2.1.3.dist-info`));
    fs.writeFileSync(path.join(root, `${venv}/numpy-2.1.3.dist-info/RECORD`), "numpy/core.py,,\n");

    const c = components("/app");

    expect(c[`/${venv}/numpy/core.py`]).toBe("pypi/numpy");
    expect(c["/app/main.py"]).toBe("app");
  });

  it("keeps all links of a hard-linked file in one component", () => {
    file("opt/conda/pkgs/zlib/lib/libz.so");
    fs.mkdirSync(path.join(root, "opt/conda/lib"), { recursive: true });
    fs.linkSync(
      path.join(root, "opt/conda/pkgs/zlib/lib/libz.so"),
      path.join(root, "opt/conda/lib/libz.so"),
    );
    fs.mkdirSync(path.join(root, "opt/conda/conda-meta"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "opt/conda/conda-meta/zlib-1.3-0.json"),
      JSON.stringify({ name: "zlib", files: ["lib/libz.so"] }),
    );

    const c = components();

    expect(c["/opt/conda/lib/libz.so"]).toBe("conda/zlib");
    expect(c["/opt/conda/pkgs/zlib/lib/libz.so"]).toBe("conda/zlib");
  });

  it("maps dpkg's /bin paths to /usr/bin on usrmerge images", () => {
    file("usr/bin/bash");
    fs.mkdirSync(path.join(root, "var/lib/dpkg/info"), { recursive: true });
    fs.writeFileSync(path.join(root, "var/lib/dpkg/info/bash.list"), "/bin\n/bin/bash\n");

    expect(components()["/usr/bin/bash"]).toBe("deb/bash");
  });

  /** A .pyc header: Python >= 3.7 (magic, flags, mtime, size) or <= 3.6 (magic, mtime, size). */
  function pyc(opts: { magic: number; flags?: number; mtime: number; size: number }): Buffer {
    const parts = [Buffer.from([opts.magic & 0xff, opts.magic >> 8, 0x0d, 0x0a])];
    const u32 = (v: number) => {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(v >>> 0, 0);
      return b;
    };
    if (opts.flags !== undefined) parts.push(u32(opts.flags));
    parts.push(u32(opts.mtime), u32(opts.size), Buffer.from("BYTECODE"));
    return Buffer.concat(parts);
  }

  /** Writes a .py with the given mtime and size, plus its __pycache__ .pyc. */
  function module(dir: string, name: string, pycName: string, header: Buffer, mtime: number) {
    file(`${dir}/${name}.py`, 20);
    fs.utimesSync(path.join(root, `${dir}/${name}.py`), mtime, mtime);
    fs.mkdirSync(path.join(root, `${dir}/__pycache__`), { recursive: true });
    fs.writeFileSync(path.join(root, `${dir}/__pycache__/${pycName}`), header);
  }

  function runForReal(): string {
    const result = spawnSync("python3", ["-", root, "/app", "1000", "--no-xattrs"], {
      input: script,
      encoding: "utf-8",
    });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  }

  it("makes a valid timestamp .pyc (py >= 3.7) hash-based and sets every mtime to 0", () => {
    const lib = "usr/local/lib/python3.12";
    module(
      lib,
      "os",
      "os.cpython-312.pyc",
      pyc({ magic: 3531, flags: 0, mtime: 1700000000, size: 20 }),
      1700000000,
    );
    module(
      lib,
      "re",
      "re.cpython-312.opt-1.pyc",
      pyc({ magic: 3531, flags: 0, mtime: 1700000000, size: 20 }),
      1700000000,
    );

    const summary = JSON.parse(runForReal());

    for (const name of ["os.cpython-312.pyc", "re.cpython-312.opt-1.pyc"]) {
      const data = fs.readFileSync(path.join(root, `${lib}/__pycache__/${name}`));
      expect(data.readUInt32LE(4), name).toBe(1); // unchecked-hash flag
      expect(data.subarray(16).toString(), name).toBe("BYTECODE"); // bytecode unchanged
    }
    expect(fs.statSync(path.join(root, `${lib}/os.py`)).mtimeMs).toBe(0);
    expect(fs.statSync(path.join(root, lib)).mtimeMs).toBe(0);
    expect(summary).toEqual({ special: [], max_mtime: 0 });
  });

  it("leaves a stale .pyc stale, so Python recompiles it as in the original image", () => {
    const lib = "usr/local/lib/python3.12";
    // the .py was edited (same size) after compiling: recorded mtime differs from the file's
    const stale = pyc({ magic: 3531, flags: 0, mtime: 1600000000, size: 20 });
    module(lib, "mymod", "mymod.cpython-312.pyc", stale, 1700000000);

    runForReal();

    expect(fs.readFileSync(path.join(root, `${lib}/__pycache__/mymod.cpython-312.pyc`))).toEqual(
      stale,
    );
    expect(fs.statSync(path.join(root, `${lib}/mymod.py`)).mtimeMs).toBe(0);
  });

  it("keeps the .py mtime of a valid Python <= 3.6 .pyc, which has no hash form", () => {
    const lib = "usr/local/lib/python3.6";
    const old = pyc({ magic: 3379, mtime: 1500000000, size: 20 });
    module(lib, "json", "json.cpython-36.pyc", old, 1500000000);

    const summary = JSON.parse(runForReal());

    expect(fs.statSync(path.join(root, `${lib}/json.py`)).mtimeMs).toBe(1500000000 * 1000);
    expect(fs.readFileSync(path.join(root, `${lib}/__pycache__/json.cpython-36.pyc`))).toEqual(old);
    expect(summary.max_mtime).toBe(1500000000);
  });

  it.skipIf(process.platform === "win32")("reports FIFOs, which chunkah cannot store", () => {
    file("app/main.py");
    spawnSync("mkfifo", [path.join(root, "app/pipe")]);

    expect(JSON.parse(runForReal()).special).toEqual(["/app/pipe"]);
  });

  it("prefers a package owner for hard links, whatever the path order", () => {
    // pkgs/ sorts before share/: the package owner must still win
    file("opt/conda/share/zoneinfo/UTC");
    fs.mkdirSync(path.join(root, "opt/conda/pkgs/tzdata/share/zoneinfo"), { recursive: true });
    fs.linkSync(
      path.join(root, "opt/conda/share/zoneinfo/UTC"),
      path.join(root, "opt/conda/pkgs/tzdata/share/zoneinfo/UTC"),
    );
    fs.mkdirSync(path.join(root, "opt/conda/conda-meta"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "opt/conda/conda-meta/tzdata-2024a-0.json"),
      JSON.stringify({ name: "tzdata", files: ["share/zoneinfo/UTC"] }),
    );

    const c = components();

    expect(c["/opt/conda/share/zoneinfo/UTC"]).toBe("conda/tzdata");
    expect(c["/opt/conda/pkgs/tzdata/share/zoneinfo/UTC"]).toBe("conda/tzdata");
  });
});
