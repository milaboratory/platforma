import { Command } from "commander";
import { createLogger } from "../../compiler/util";
import { dumpArtifacts } from "../../shared/dump";
import { stdout } from "node:process";
import type { ArtifactType } from "../../compiler/package";
import * as opts from "../../shared/basecmd";

export default function dumpArtifactsCommand(): Command {
  const cmd = new Command("artifacts").description(
    "parse sources in current package and dump all found artifacts to stdout",
  );

  opts.addOptions(cmd, opts.GlobalOptions(), opts.ArtifactTypeOptions());

  cmd.action(async (o) => {
    const logger = createLogger(o.logLevel as string);
    dumpArtifacts(logger, stdout, o.type == "all" ? undefined : (o.type as ArtifactType));
  });

  return cmd;
}
