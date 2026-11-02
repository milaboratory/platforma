import { Command, Option } from "commander";
import * as cmdOpts from "../cmd-opts";
import * as util from "../util";
import * as block from "../block";

export default function createBlockCommand(): Command {
  const cmd = new Command("create-block").description(
    "Helps to create a new block by downloading a block's template. " +
      "Options not given as flags are asked for interactively.",
  );

  cmdOpts.addOptions(cmd, cmdOpts.GlobalOptions());
  cmd.addOption(new Option("--npm-org <name>", 'organization name for npm, e.g. "platforma-open"'));
  cmd.addOption(new Option("--org <name>", 'organization name, e.g. "my-org"'));
  cmd.addOption(new Option("--block-name <name>", 'name of the block, e.g. "hello-world"'));
  cmd.addOption(
    new Option(
      "--software <platforms...>",
      "software platforms besides Tengo; pass 'none' for Tengo only (skips the question)",
    ).choices(["python", "none"]),
  );

  cmd.action(async (o) => {
    const flags = cmdOpts.toFlags(o);
    const logger = util.createLogger(flags["log-level"]);

    await block.createBlock(logger, {
      npmOrgName: o.npmOrg,
      orgName: o.org,
      blockName: o.blockName,
      softwarePlatforms: softwareFromFlag(o.software),
    });
  });

  return cmd;
}

function softwareFromFlag(values: string[] | undefined): block.CreateBlockPlatform[] | undefined {
  if (values === undefined) return undefined;
  return values.includes("python") ? ["Tengo", "Python"] : ["Tengo"];
}
