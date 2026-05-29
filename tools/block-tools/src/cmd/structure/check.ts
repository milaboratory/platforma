import { Command, Flags } from "@oclif/core";
import path from "node:path";
import { runStructureForPath, formatChanges } from "../../structure/cli/run-structure";

export default class StructureCheck extends Command {
  static override description =
    "Check block(s) against the canonical structure (read-only). Exits non-zero if any diff would land — used as the CI gate.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> ./my-block",
    "<%= config.bin %> <%= command.id %> --sdk-internal etc/blocks/*",
  ];

  // Variadic positional block paths (shell-expanded globs).
  static override strict = false;

  static override flags = {
    "sdk-internal": Flags.boolean({
      description: "block(s) live inside the SDK monorepo; skip root-scope rules",
    }),
  };

  public async run(): Promise<void> {
    const { argv, flags } = await this.parse(StructureCheck);
    const paths = (argv as string[]).length > 0 ? (argv as string[]) : ["."];
    const templatesRoot = path.join(this.config.root, "src", "structure", "templates");

    let anyChanged = false;
    for (const p of paths) {
      const res = await runStructureForPath({
        blockPath: p,
        isSdkInternal: flags["sdk-internal"],
        updateDepsOnly: false,
        mode: "check",
        templatesRoot,
        log: (m) => this.log(m),
      });
      this.log(formatChanges(p, res.changes));
      if (res.changes.length > 0) anyChanged = true;
    }

    if (anyChanged) {
      this.error(
        "Structure check failed: one or more blocks are out of date. Run `structure refresh`.",
        {
          exit: 1,
        },
      );
    }
  }
}
