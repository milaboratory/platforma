import { Command } from "commander";
import * as cmdOpts from "../cmd-opts";
import * as util from "../util";
import * as block from "../block";

export default function createBlockCommand(): Command {
  const cmd = new Command("create-block").description(
    "Helps to create a new block by downloading a block's template.",
  );

  cmdOpts.addOptions(cmd, cmdOpts.GlobalOptions());

  cmd.action(async (o) => {
    const flags = cmdOpts.toFlags(o);
    const logger = util.createLogger(flags["log-level"]);

    await block.createBlock(logger);
  });

  return cmd;
}
