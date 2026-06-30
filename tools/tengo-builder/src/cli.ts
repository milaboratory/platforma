import { Command } from "commander";
import buildCommand from "./commands/build";
import checkCommand from "./commands/check";
import testCommand from "./commands/test";
import dumpArtifactsCommand from "./commands/dump/artifacts";
import dumpSoftwareCommand from "./commands/dump/software";

export function buildProgram(): Command {
  const program = new Command();
  program.name("pl-tengo").description("Pl Tengo Template Builder");

  program.addCommand(buildCommand());
  program.addCommand(checkCommand());
  program.addCommand(testCommand());

  // `dump` is a pure topic (no action): `pl-tengo dump` prints help.
  const dump = new Command("dump").description("dump parsed artifacts or software descriptors");
  dump.addCommand(dumpArtifactsCommand());
  dump.addCommand(dumpSoftwareCommand());
  program.addCommand(dump);

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}
