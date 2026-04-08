import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

/**
 * Verifies that a command exiting with non-zero code
 * propagates the error through the resource tree,
 * and the error message contains command name, stderr output,
 * exit code, and original command arguments.
 */
tplTest.concurrent("exec error: command exits with non-zero code", async ({ helper, expect }) => {
  const commandName = "test-failing-command";
  const errorMessage = "something went wrong in the test command";
  const exitCode = "1";

  const result = await helper.renderTemplate(false, "exec.run.fail_with_error", ["main"], (tx) => ({
    commandName: tx.createValue(Pl.JsonObject, JSON.stringify(commandName)),
    errorMessage: tx.createValue(Pl.JsonObject, JSON.stringify(errorMessage)),
    exitCode: tx.createValue(Pl.JsonObject, JSON.stringify(exitCode)),
  }));
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsString());

  const error = await mainResult.awaitStableValue().catch((e: Error) => e);
  expect(error).toBeInstanceOf(Error);

  const msg = (error as Error).message;
  // must contain the command name set by block developer
  expect(msg).toContain(commandName);
  // must contain the stderr output
  expect(msg).toContain(errorMessage);
  // must mention the exit code
  expect(msg).toMatch(/Exited with code 1/);
  // must contain original command arguments so the user can identify what failed
  expect(msg).toContain("/usr/bin/env");
  expect(msg).toContain("bash");
});
