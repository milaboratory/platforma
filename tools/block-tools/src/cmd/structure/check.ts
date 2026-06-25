import { Command } from "commander";
import path from "node:path";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import { runStructureForPath, formatChanges } from "../../structure/cli/run-structure";

export function structureCheckCommand(packageRoot: string): Command {
  const cmd = new Command("check").description(
    "Check block(s) against the canonical structure (read-only). Exits non-zero if any diff would land — used as the CI gate.",
  );

  // Variadic positional block paths (shell-expanded globs).
  cmd.argument("[paths...]", "block path(s); defaults to the current directory");
  cmd.option("--sdk-internal", "block(s) live inside the SDK monorepo; skip root-scope rules");

  cmd.action(async (argv: string[], flags) => {
    const logger = new ConsoleLoggerAdapter();
    const paths = argv.length > 0 ? argv : ["."];
    const templatesRoot = path.join(packageRoot, "src", "structure", "templates");

    let anyChanged = false;
    for (const p of paths) {
      const res = await runStructureForPath({
        blockPath: p,
        isSdkInternal: Boolean(flags.sdkInternal),
        updateDepsOnly: false,
        mode: "check",
        templatesRoot,
        log: (m) => logger.info(m),
      });
      logger.info(formatChanges(p, res.changes));
      if (res.changes.length > 0) anyChanged = true;
    }

    if (anyChanged) {
      throw new Error(
        "Structure check failed: one or more blocks are out of date. Run `structure refresh`.",
      );
    }
  });

  return cmd;
}
