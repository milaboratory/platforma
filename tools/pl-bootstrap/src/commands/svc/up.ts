import { Command } from "commander";
import Core from "../../core";
import * as cmdOpts from "../../cmd-opts";
import * as util from "../../util";
import state from "../../state";

export default function svcUpCommand(): Command {
  const cmd = new Command("up").description("List available instances");

  cmd.argument("[name]", "instance name (defaults to the selected instance)");
  cmdOpts.addOptions(cmd, cmdOpts.GlobalOptions());

  cmd.action(async (nameArg: string | undefined, o) => {
    const flags = cmdOpts.toFlags(o);

    const logger = util.createLogger(flags["log-level"]);
    const core = new Core(logger);

    const name = nameArg ?? state.currentInstanceName;

    if (!name) {
      logger.error(
        `no pl service instance is selected. Select instance with 'select' command or provide name to 'up'`,
      );
      process.exit(1);
    }

    const children = core.switchInstance(state.getInstanceInfo(name));

    const results: Promise<void>[] = [];
    for (const child of children) {
      results.push(
        new Promise((resolve, reject) => {
          child.on("close", resolve);
          child.on("error", reject);
        }),
      );
    }

    await Promise.all(results);
  });

  return cmd;
}
