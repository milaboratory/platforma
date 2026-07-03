import { Command } from "commander";
import Core from "../../core";
import * as cmdOpts from "../../cmd-opts";
import * as util from "../../util";

export default function svcDeleteCommand(): Command {
  const cmd = new Command("delete").description("List available instances");

  cmd.argument("[name]", "instance name to remove");
  cmdOpts.addOptions(cmd, cmdOpts.GlobalOptions());
  cmd.option("--all", "remove all known instances");

  cmd.action(async (nameArg: string | undefined, o) => {
    const flags = cmdOpts.toFlags(o);

    const logger = util.createLogger(flags["log-level"]);
    const core = new Core(logger);

    if (o.all) {
      core.cleanupInstance();
      process.exit(0);
    }

    if (!nameArg) {
      logger.error(`Please, specify name of instance to be removed or set '--all' flag instead`);
      process.exit(1);
    }

    core.cleanupInstance(nameArg);
  });

  return cmd;
}
