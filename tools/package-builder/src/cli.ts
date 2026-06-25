import { Command } from "commander";
import { buildAllCommand } from "./commands/build/all";
import { buildDockerCommand } from "./commands/build/docker";
import { buildPackagesCommand } from "./commands/build/packages";
import { prepublishCommand } from "./commands/prepublish";
import { publishAllCommand } from "./commands/publish/all";
import { publishDockerCommand } from "./commands/publish/docker";
import { publishPackagesCommand } from "./commands/publish/packages";

export function buildProgram(): Command {
  const program = new Command();
  program.name("pl-pkg").description("MiLaboratories Platforma Package builder");

  // `build` is runnable (= build all) and the parent topic for its subcommands.
  // `build all` is registered as an explicit alias of `build` (oclif build:all).
  const build = buildAllCommand("build");
  build.addCommand(buildAllCommand("all"));
  build.addCommand(buildDockerCommand());
  build.addCommand(buildPackagesCommand());
  program.addCommand(build);

  program.addCommand(prepublishCommand());

  // `publish` is a pure topic (no action): `pl-pkg publish` prints help.
  const publish = new Command("publish").description(
    "publish entrypoint descriptors AND software package archive",
  );
  publish.addCommand(publishAllCommand());
  publish.addCommand(publishDockerCommand());
  publish.addCommand(publishPackagesCommand());
  program.addCommand(publish);

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}
