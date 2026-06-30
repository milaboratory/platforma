import { Command } from "commander";
import { createLogger } from "../compiler/util";
import { dumpArtifacts } from "../shared/dump";
import { addOptions, GlobalOptions } from "../shared/basecmd";
import { spawnEmbed, waitFor } from "../shared/proc";
import { TengoTesterBinaryPath } from "@milaboratories/tengo-tester";

export default function testCommand(): Command {
  const cmd = new Command("test").description("run tengo unit tests (.test.tengo)");

  cmd.argument("[paths...]", "source paths to test (defaults to ./src)");
  addOptions(cmd, GlobalOptions());

  cmd.action(async (paths: string[], o) => {
    const logLevel = o.logLevel as string;
    const logger = createLogger(logLevel);

    const testerArgs: string[] = paths.length == 0 ? ["./src"] : paths;

    const tester = spawnEmbed(
      TengoTesterBinaryPath,
      "run",
      "--log-level",
      logLevel,
      "--artifacts",
      "-",
      ...testerArgs,
    );

    try {
      dumpArtifacts(logger, tester.stdin);
    } catch (err: unknown) {
      logger.error(err);
    } finally {
      tester.stdin.end();
      const code = await waitFor(tester);
      process.exit(code);
    }
  });

  return cmd;
}
