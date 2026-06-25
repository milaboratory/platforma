import { Command } from "commander";
import { createLogger } from "../../compiler/util";
import { dumpSoftware } from "../../shared/dump";
import { stdout } from "node:process";
import * as opts from "../../shared/basecmd";

export default function dumpSoftwareCommand(): Command {
  const cmd = new Command("software").description(
    "parse sources in current package and dump all software descriptors used by templates",
  );

  opts.addOptions(cmd, opts.GlobalOptions());

  cmd.action(async (o) => {
    const logger = createLogger(o.logLevel as string);
    dumpSoftware(logger, stdout);
  });

  return cmd;
}
