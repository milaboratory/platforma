import { Command } from "commander";
import Core from "../core";
import state from "../state";
import * as cmdOpts from "../cmd-opts";
import * as util from "../util";

export default function stopCommand(): Command {
  const cmd = new Command("stop").description("Stop platforma service");

  cmdOpts.addOptions(cmd, cmdOpts.GlobalOptions());

  cmd.action(async (o) => {
    const flags = cmdOpts.toFlags(o);

    const logger = util.createLogger(flags["log-level"]);
    const core = new Core(logger);

    if (state.currentInstance) {
      core.stopInstance(state.currentInstance);
    } else {
      logger.warn("up/start command was not called for any instance, nothing to stop");
    }
  });

  return cmd;
}
