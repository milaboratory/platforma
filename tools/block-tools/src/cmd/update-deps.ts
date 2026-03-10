import { Command } from "@oclif/core";
import { updatePackages } from "@platforma-sdk/blocks-deps-updater";

export default class UpdateDeps extends Command {
  static override description =
    "Updates @platforma-sdk and @milaboratories packages in pnpm-workspace.yaml catalog to their latest versions from npm registry.";

  static override examples = ["<%= config.bin %> <%= command.id %>"];

  public async run(): Promise<void> {
    await updatePackages();
  }
}
