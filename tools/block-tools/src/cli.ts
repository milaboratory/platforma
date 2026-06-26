import { Command } from "commander";
import { buildMetaCommand } from "./cmd/build-meta";
import { buildModelCommand } from "./cmd/build-model";
import { packCommand } from "./cmd/pack";
import { publishCommand } from "./cmd/publish";
import { refreshRegistryCommand } from "./cmd/refresh-registry";
import { markStableCommand } from "./cmd/mark-stable";
import { updateDepsCommand } from "./cmd/update-deps";
import { listOverviewSnapshotsCommand } from "./cmd/list-overview-snapshots";
import { restoreOverviewFromSnapshotCommand } from "./cmd/restore-overview-from-snapshot";
import { uploadPackageV1Command } from "./cmd/upload-package-v1";
import { structureCheckCommand } from "./cmd/structure/check";
import { structureInitCommand } from "./cmd/structure/init";
import { structureRefreshCommand } from "./cmd/structure/refresh";
import { softwareCommand } from "./cmd/software";

// `packageRoot` is the package install root (the dir containing `src/` and
// `bin/`); the `structure` commands resolve their templates under it. bin/run.js
// passes it in; defaults to cwd for tests/introspection.
export function buildProgram(packageRoot: string = process.cwd()): Command {
  const program = new Command();
  program
    .name("block-tools")
    .description("Utility to manipulate Platforma Blocks and Block Registry");

  program.addCommand(buildMetaCommand());
  program.addCommand(buildModelCommand());
  program.addCommand(packCommand());
  program.addCommand(publishCommand());
  program.addCommand(refreshRegistryCommand());
  program.addCommand(markStableCommand());
  program.addCommand(updateDepsCommand(packageRoot));
  program.addCommand(listOverviewSnapshotsCommand());
  program.addCommand(restoreOverviewFromSnapshotCommand());
  program.addCommand(uploadPackageV1Command());
  program.addCommand(softwareCommand());

  // `structure` subcommands: check | init | refresh.
  const structure = new Command("structure").description(
    "Manage block scaffolding against the canonical structure (check / init / refresh)",
  );
  structure.addCommand(structureCheckCommand(packageRoot));
  structure.addCommand(structureInitCommand(packageRoot));
  structure.addCommand(structureRefreshCommand(packageRoot));
  program.addCommand(structure);

  return program;
}

export async function run(argv: string[], packageRoot: string): Promise<void> {
  await buildProgram(packageRoot).parseAsync(argv);
}
