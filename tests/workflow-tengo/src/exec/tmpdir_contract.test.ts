import { tplTest } from "@platforma-sdk/test";

/*
 * The temporary-directory contract, seen from inside the running command.
 *
 * A block asks for scratch space with no size — a real request for a temporary directory without a
 * device — and the command must find TMPDIR and TMP naming the same writable place that
 * {system.scratch.path} names. This holds on a current backend, which arranges it, and on one from
 * before the contract, where the SDK's compatibility wrapper does; the command cannot tell which,
 * and neither can this test. That is what makes it worth running against both.
 *
 * The template fails the command outright if either variable is unset, so a green run here means
 * the values arrived, not merely that the exec completed.
 */
tplTest(
  "tmpdir-and-scratch-path-agree",
  { timeout: 900_000 },
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.run.tmpdir_contract",
      ["tmpdir"],
    );

    const reported = await result
      .computeOutput("tmpdir", (a) => a?.getDataAsString())
      .awaitStableValue();

    expect(reported).toBeDefined();

    const [tmpdir, tmp, scratchPath, probe] = reported!.split(" ");

    // The probe file the command wrote and read back: proof the directory is writable, not just
    // that a path was set. On an old backend this is what shows the wrapper's mkdir -p ran.
    expect(probe).toBe("probe");

    expect(tmpdir).not.toHaveLength(0);
    expect(tmp).toBe(tmpdir);
    expect(scratchPath).toBe(tmpdir);

    // Wherever it is backed, the directory is the one the contract names.
    expect(tmpdir).toContain(".pl/tmp");
  },
);
