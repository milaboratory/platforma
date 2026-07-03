import { Command, Option } from "commander";
import path from "node:path";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import {
  resolveBlockVars,
  runInit,
  SUPPORTED_PLATFORMS,
  type InitFlagValues,
} from "../../structure/init-block-constructor";

export function structureInitCommand(packageRoot: string): Command {
  const cmd = new Command("init").description(
    "Scaffold a fresh Platforma block from the canonical structure. Missing flags are prompted unless --non-interactive.",
  );

  cmd.argument("[path]", "target directory (default: <short-name> under the current directory)");
  cmd.option("--npm-org <org>", "npm org, e.g. @platforma-open");
  cmd.option("--org-scope <scope>", "org scope, e.g. my-org");
  cmd.option("--short-name <name>", "block short name, e.g. mixcr-clonotyping");
  cmd.option("--with-software", "include a software module");
  cmd.option("--no-software", "omit the software module");
  cmd.addOption(
    new Option("--platform <platform>", "software platform (single-valued)").choices([
      ...SUPPORTED_PLATFORMS,
    ]),
  );
  cmd.option("--non-interactive", "error on any missing flag instead of prompting");

  cmd.action(async (argPath: string | undefined, flags) => {
    const logger = new ConsoleLoggerAdapter();

    // commander maps `--with-software` -> flags.withSoftware===true and
    // `--no-software` -> flags.software===false
    const withSoftwareFlag = flags.withSoftware === true;
    const noSoftwareFlag = flags.software === false;
    if (withSoftwareFlag && noSoftwareFlag) {
      throw new Error("--with-software and --no-software are mutually exclusive.");
    }
    const withSoftware = withSoftwareFlag ? true : noSoftwareFlag ? false : undefined;

    const flagValues: InitFlagValues = {
      npmOrg: flags.npmOrg,
      orgScope: flags.orgScope,
      shortName: flags.shortName,
      withSoftware,
      platform: flags.platform,
      nonInteractive: flags.nonInteractive,
    };

    const vars = await resolveBlockVars(flagValues);
    const blockPath = argPath ? path.resolve(argPath) : path.resolve(process.cwd(), vars.shortName);
    const templatesRoot = path.join(packageRoot, "src", "structure", "templates");

    await runInit({ vars, blockPath, templatesRoot, log: (m) => logger.info(m) });
  });

  return cmd;
}
