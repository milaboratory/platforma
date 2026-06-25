import { Command } from "commander";
import Core from "../../core";
import * as cmdOpts from "../../cmd-opts";
import * as util from "../../util";
import state from "../../state";

export default function svcDownCommand(): Command {
  const cmd = new Command("down").description("List available instances");

  cmd.argument("[name]", "instance name (defaults to the selected instance)");
  cmdOpts.addOptions(cmd, cmdOpts.GlobalOptions());

  cmd.action(async (nameArg: string | undefined, o) => {
    const flags = cmdOpts.toFlags(o);

    const logger = util.createLogger(flags["log-level"]);
    const core = new Core(logger);

    const name = nameArg ?? state.currentInstanceName;

    if (!name) {
      logger.info(`no pl service instance selected. No service was stopped`);
      process.exit(0);
    }

    core.stopInstance(state.getInstanceInfo(name));
  });

  return cmd;
}
