import { Command } from "commander";
import Core from "../core";
import * as cmdOpts from "../cmd-opts";
import * as util from "../util";

export default function resetCommand(): Command {
  const cmd = new Command("reset").description(
    "Clear service state (forget last run command, destroy docker services, volumes and so on)",
  );

  cmdOpts.addOptions(cmd, cmdOpts.GlobalOptions());

  cmd.action(async (o) => {
    const flags = cmdOpts.toFlags(o);

    const logger = util.createLogger(flags["log-level"]);
    const core = new Core(logger);
    core.cleanupInstance();
  });

  return cmd;
}
