import { Command, Flags } from "@oclif/core";
import path from "node:path";
import { runStructureForPath, formatChanges } from "../../structure/cli/run-structure";

export default class StructureRefresh extends Command {
  static override description =
    "Bring block(s) up to date with the canonical structure. Applies rules, writes files, bumps .structure version. Default mode is offline; --update-deps-only fires only catalog-bump rules (network).";

  static override examples = [
    "<%= config.bin %> <%= command.id %> ./my-block",
    "<%= config.bin %> <%= command.id %> --sdk-internal etc/blocks/*",
    "<%= config.bin %> <%= command.id %> --update-deps-only",
  ];

  static override strict = false;

  static override flags = {
    "sdk-internal": Flags.boolean({
      description: "block(s) live inside the SDK monorepo; skip root-scope rules",
    }),
    "update-deps-only": Flags.boolean({
      description:
        "fire ONLY catalog-bump rules (npm network). Follow with `pnpm install` then a plain refresh.",
    }),
  };

  public async run(): Promise<void> {
    const { argv, flags } = await this.parse(StructureRefresh);
    const paths = (argv as string[]).length > 0 ? (argv as string[]) : ["."];
    const templatesRoot = path.join(this.config.root, "src", "structure", "templates");

    for (const p of paths) {
      const res = await runStructureForPath({
        blockPath: p,
        isSdkInternal: flags["sdk-internal"],
        updateDepsOnly: flags["update-deps-only"],
        mode: "refresh",
        templatesRoot,
        log: (m) => this.log(m),
      });
      this.log(formatChanges(p, res.changes));
    }
  }
}
