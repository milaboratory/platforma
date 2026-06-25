import { Command, Option } from "commander";
import { BlockRegistryV2 } from "../v2";
import { storageByUrl } from "../io";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";

export function refreshRegistryCommand(): Command {
  const cmd = new Command("refresh-registry").description(
    "Refresh overview files based on published but not proecessed artefacts",
  );

  cmd.addOption(
    new Option("-r, --registry <address>", "full address of the registry")
      .env("PL_REGISTRY")
      .makeOptionMandatory(),
  );
  cmd.addOption(
    new Option("-m, --mode <mode>", 'refresh mode (allowed valiues: "force", "normal", "dry-run")')
      .choices(["force", "normal", "dry-run"])
      .env("PL_REGISTRY_REFRESH_DRY_RUN")
      .default("normal"),
  );

  cmd.action(async (flags) => {
    const storage = storageByUrl(flags.registry);
    const registry = new BlockRegistryV2(storage, new ConsoleLoggerAdapter());
    await registry.updateIfNeeded(flags.mode as "force" | "normal" | "dry-run");
  });

  return cmd;
}
