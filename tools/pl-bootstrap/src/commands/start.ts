import { Command } from "commander";
import Core from "../core";
import * as cmdOpts from "../cmd-opts";
import * as util from "../util";

export default function startCommand(): Command {
  const cmd = new Command("start").description("Start last run service configuraiton");

  cmdOpts.addOptions(cmd, cmdOpts.GlobalOptions());

  cmd.action(async (o) => {
    const flags = cmdOpts.toFlags(o);

    const logger = util.createLogger(flags["log-level"]);
    const core = new Core(logger);

    core.startLast();
  });

  return cmd;
}
