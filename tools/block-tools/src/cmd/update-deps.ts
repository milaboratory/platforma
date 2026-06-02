import { Command } from "@oclif/core";

/**
 * Deprecated. Phase-2 forwarding alias (spec.md § "Coexistence And
 * Retirement"): delegates to `structure refresh --update-deps-only`,
 * which lands at parity with the old `blocks-deps-updater` catalog-bump
 * semantics. Prints a deprecation warning; will be removed once the
 * structurer path has been live without surprises.
 */
export default class UpdateDeps extends Command {
  static override description =
    "[DEPRECATED] Use `block-tools structure refresh --update-deps-only`. This alias delegates to it.";

  static override examples = ["<%= config.bin %> <%= command.id %>"];

  public async run(): Promise<void> {
    this.warn(
      "`block-tools update-deps` is deprecated and will be removed in a future release. " +
        "Use `block-tools structure refresh --update-deps-only` instead. Delegating now.",
    );
    // oclif resolves commands by their internal colon-form id, even
    // though the user-facing form uses the configured " " topic separator.
    await this.config.runCommand("structure:refresh", ["--update-deps-only"]);
  }
}
