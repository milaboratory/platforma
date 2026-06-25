import { Command } from "commander";
import path from "node:path";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import { runRefresh } from "./structure/refresh";

/**
 * Deprecated. Phase-2 forwarding alias (spec.md § "Coexistence And
 * Retirement"): delegates to `structure refresh --update-deps-only`,
 * which lands at parity with the old `blocks-deps-updater` catalog-bump
 * semantics. Prints a deprecation warning; will be removed once the
 * structurer path has been live without surprises.
 */
export function updateDepsCommand(packageRoot: string): Command {
  const cmd = new Command("update-deps").description(
    "[DEPRECATED] Use `block-tools structure refresh --update-deps-only`. This alias delegates to it.",
  );

  cmd.action(async () => {
    const logger = new ConsoleLoggerAdapter();
    logger.warn(
      "`block-tools update-deps` is deprecated and will be removed in a future release. " +
        "Use `block-tools structure refresh --update-deps-only` instead. Delegating now.",
    );
    const templatesRoot = path.join(packageRoot, "src", "structure", "templates");
    await runRefresh({
      paths: ["."],
      isSdkInternal: false,
      updateDepsOnly: true,
      templatesRoot,
      logger,
    });
  });

  return cmd;
}
