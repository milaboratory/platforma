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
      result.stdout
        .split("\n")
        .filter((l) => l !== "")
        .map((l) => {
          const [p, comp] = l.split("\t");
          return [p ?? "", comp ?? ""];
        }),
    );
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

  it("ignores RECORD entries that point outside the root filesystem", () => {
    file(`${site}/evil/x.py`);
    fs.mkdirSync(path.join(root, `${site}/evil-1.0.dist-info`));
    fs.writeFileSync(
      path.join(root, `${site}/evil-1.0.dist-info/RECORD`),
      "../../../../../../../../etc/passwd,,\nevil/x.py,,\n",
    );

    const c = components();

    expect(Object.keys(c).every((p) => p.startsWith("/"))).toBe(true);
    expect(c[`/${site}/evil/x.py`]).toBe("pypi/evil");
  });
});
