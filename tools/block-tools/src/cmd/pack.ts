import { Command } from "commander";
import { loadPackDescription } from "../v2/source_package";
import path from "node:path";
import { buildBlockPackDist } from "../v2/build_dist";

export function packCommand(): Command {
  const cmd = new Command("pack").description(
    "Builds block pack and outputs a block pack manifest consolidating all " +
      "references assets into a single folder",
  );

  cmd.option("-i, --modulePath <path>", "input module path", ".");
  cmd.option("-o, --destinationPath <path>", "output folder", "./block-pack");

  cmd.action(async (flags) => {
    const description = await loadPackDescription(path.resolve(flags.modulePath));
    await buildBlockPackDist(description, path.resolve(flags.destinationPath));
  });

  return cmd;
}
