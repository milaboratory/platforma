import { tplTest } from "@platforma-sdk/test";

// The fixture is a local binary package: it declares requireDocker false and builds with
// PL_BUILD_VARIANT=binary PL_BUILD_LOCATION=local, so its only artifact is the source tree on
// the machine that ran the build. A pure-Kubernetes deploy runs each command as a pod in the
// cluster, which cannot read that machine's disk, and the backend fails to stage the sources:
//
//   failed to copy data from ".../tests/software/venv-identity/src" to "/data/workspace/...":
//   lstat .../requirements-b.txt: no such file or directory
//
// Giving the fixture a docker artifact would let it run there; until it has one the case can
// only report the missing image.
const ON_K8S = process.env.PL_TEST_K8S === "1";

// Two python entrypoints share one interpreter and one source root, and differ only in which
// requirements file they declare. Each must therefore get its own virtual environment.
//
// Before the fix they did not: a run environment was saved holding the bare venv only, with
// dependencies installed into it afterwards, so its content hash was a function of the interpreter
// alone. Both entrypoints hashed identically, deduplicated onto one slot, and the second resolved to
// whichever environment was registered first — the failure behind MILAB-6908, where a script ran in
// another package's venv and could not import a dependency it declares.
//
// Each script prints sys.prefix, which is the venv root it is actually running in.
tplTest.concurrent(
  "two python softwares sharing an interpreter get their own virtual environments",
  { timeout: 300000 },
  async ({ helper, expect, skip }) => {
    if (ON_K8S) {
      skip("the venv-identity fixture is a local binary package with no docker artifact");
      return;
    }

    const result = await helper.renderTemplate(
      false,
      "exec.run.venv_identity",
      ["venvA", "venvB"],
      () => ({}),
    );

    const venvA = await result
      .computeOutput("venvA", (a) => a?.getDataAsString())
      .awaitStableValue();
    const venvB = await result
      .computeOutput("venvB", (a) => a?.getDataAsString())
      .awaitStableValue();

    expect(venvA, "entrypoint A reported no virtual environment").toBeDefined();
    expect(venvB, "entrypoint B reported no virtual environment").toBeDefined();

    // Guards the assertion below: an empty or non-venv prefix would make the inequality check pass
    // for the wrong reason.
    expect(venvA!.trim()).toMatch(/\/venv$/);
    expect(venvB!.trim()).toMatch(/\/venv$/);

    expect(
      venvA!.trim(),
      "both entrypoints ran in the same virtual environment, so one borrowed the other's",
    ).not.toBe(venvB!.trim());
  },
);
