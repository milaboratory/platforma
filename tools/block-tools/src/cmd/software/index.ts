import { Command } from "commander";
import { softwareBuildCommand } from "./build";

// `software` parent command: per-target software build (and future software subcommands).
export function softwareCommand(): Command {
  const cmd = new Command("software").description("Build and publish a block's software modules");
  cmd.addCommand(softwareBuildCommand());
  return cmd;
}
