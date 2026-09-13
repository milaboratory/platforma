import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

/*
 * A command may not set its own TMPDIR or TMP.
 *
 * Temporary storage is arranged by the deployment: the runner creates the directory, sizes it,
 * points both variables at it and removes it after the command. A command that redirected them
 * would write its temporary data onto storage nothing clears, or among its own results. So a
 * backend carrying the temporary-directory contract rejects such a command before it runs, and
 * names the fix - '{system.scratch.path}' - in the error a block developer reads.
 *
 * The rejection is permanent, not a failed run: the command never starts, so there is no exit code
 * and no output. That is what this test asserts, by expecting the output to fail rather than to
 * carry a value.
 */
tplTest.concurrent(
  "exec: setting TMPDIR and TMP in the command environment is refused",
  async ({ helper, expect }) => {
    const customPath = "/tmp/block-picked-this-itself";

    const result = await helper.renderTemplate(
      false,
      "exec.run.tmpdir_env_forbidden",
      ["main"],
      (tx) => ({
        customPath: tx.createValue(Pl.JsonObject, JSON.stringify(customPath)),
      }),
    );

    const error = await result
      .computeOutput("main", (a) => a?.getDataAsString())
      .awaitStableValue()
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);

    const msg = (error as Error).message;
    // Both halves of the pair are refused, each named separately, so the block developer knows
    // every line to delete rather than only the first one the backend tripped over. The closing
    // quote keeps the TMP check from being satisfied by the TMPDIR message.
    expect(msg).toContain('environment variable "TMPDIR"');
    expect(msg).toContain('environment variable "TMP"');
    // The reason, and the supported way to name the directory instead.
    expect(msg).toContain("temporary storage is controlled by the infrastructure");
    expect(msg).toContain("{system.scratch.path}");
    // The command was refused, not run: nothing echoed the path back.
    expect(msg).not.toContain(customPath);
  },
);
