import { Command, Option } from "commander";
import { BlockRegistryV2, loadPackDescriptionRaw } from "../v2";
import path from "node:path";
import { overrideDescriptionVersion, StableChannel } from "@milaboratories/pl-model-middle-layer";
import { storageByUrl } from "../io";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";

export function markStableCommand(): Command {
  const cmd = new Command("mark-stable").description("Mark target block stable");

  cmd.option("-i, --modulePath <path>", "input module path", ".");
  cmd.addOption(
    new Option("-c, --channel <channel name>", "custom channel").default(StableChannel).hideHelp(),
  );
  cmd.option("-v, --version-override <path>", "override package version");
  cmd.addOption(
    new Option("-r, --registry <address>", "full address of the registry")
      .env("PL_REGISTRY")
      .makeOptionMandatory(),
  );
  cmd.addOption(
    new Option("--refresh", "refresh repository after adding the package")
      .default(true)
      .env("PL_REGISTRY_REFRESH"),
  );
  cmd.option("--no-refresh", "do not refresh repository after adding the package");
  cmd.option(
    "--unmark",
    'reverses meaning of this command, flag can be used to remove "stable" flag from the package',
    false,
  );

  cmd.action(async (flags) => {
    let description = await loadPackDescriptionRaw(path.resolve(flags.modulePath));
    if (flags.versionOverride)
      description = overrideDescriptionVersion(description, flags.versionOverride);
    const storage = storageByUrl(flags.registry);
    const registry = new BlockRegistryV2(storage, new ConsoleLoggerAdapter());

    if (flags.unmark) await registry.removePackageFromChannel(description.id, flags.channel);
    else await registry.addPackageToChannel(description.id, flags.channel);

    if (flags.refresh) await registry.updateIfNeeded();
  });

  return cmd;
}
