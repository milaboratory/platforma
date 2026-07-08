import { Command } from "commander";
import path from "node:path";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import { runStructureForPath, formatChanges } from "../../structure/cli/run-structure";

// Shared by `structure refresh` and the deprecated `update-deps` alias.
export async function runRefresh(opts: {
  paths: string[];
  isSdkInternal: boolean;
  updateDepsOnly: boolean;
  templatesRoot: string;
  logger: MiLogger;
}): Promise<void> {
  for (const p of opts.paths) {
    const res = await runStructureForPath({
      blockPath: p,
      isSdkInternal: opts.isSdkInternal,
      updateDepsOnly: opts.updateDepsOnly,
      mode: "refresh",
      templatesRoot: opts.templatesRoot,
      log: (m) => opts.logger.info(m),
    });
    opts.logger.info(formatChanges(p, res.changes));
  }
}

export function structureRefreshCommand(packageRoot: string): Command {
  const cmd = new Command("refresh").description(
    "Bring block(s) up to date with the canonical structure. Applies rules, writes files, bumps .structure version. Default mode is offline; --update-deps-only fires only catalog-bump rules (network).",
  );

  cmd.argument("[paths...]", "block path(s); defaults to the current directory");
  cmd.option("--sdk-internal", "block(s) live inside the SDK monorepo; skip root-scope rules");
  cmd.option(
    "--update-deps-only",
    "fire ONLY catalog-bump rules (npm network). Follow with `pnpm install` then a plain refresh.",
  );

  cmd.action(async (argv: string[], flags) => {
    const paths = argv.length > 0 ? argv : ["."];
    const templatesRoot = path.join(packageRoot, "src", "structure", "templates");
    await runRefresh({
      paths,
      isSdkInternal: Boolean(flags.sdkInternal),
      updateDepsOnly: Boolean(flags.updateDepsOnly),
      templatesRoot,
      logger: new ConsoleLoggerAdapter(),
    });
  });

  return cmd;
}
