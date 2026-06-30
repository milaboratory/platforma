import { Command, Option } from "commander";
import { BlockRegistryV2 } from "../v2/registry/registry";
import { storageByUrl } from "../io/storage";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";

export function listOverviewSnapshotsCommand(): Command {
  const cmd = new Command("list-overview-snapshots").description(
    "List all available global overview snapshots in the registry",
  );

  cmd.addOption(
    new Option("-r, --registry <address>", "full address of the registry")
      .env("PL_REGISTRY")
      .makeOptionMandatory(),
  );
  cmd.option("--json", "output in JSON format", false);

  cmd.action(async (flags) => {
    const logger = new ConsoleLoggerAdapter();
    const storage = storageByUrl(flags.registry);
    const registry = new BlockRegistryV2(storage, logger);

    const snapshots = await registry.listGlobalOverviewSnapshots();

    if (flags.json) {
      logger.info(JSON.stringify(snapshots, null, 2));
    } else {
      if (snapshots.length === 0) {
        logger.info("No snapshots found.");
      } else {
        logger.info(`Found ${snapshots.length} snapshot(s):\n`);
        for (const snapshot of snapshots) {
          logger.info(`  ${snapshot.timestamp}`);
          logger.info(`    Path: ${snapshot.path}`);
          logger.info("");
        }
      }
    }
  });

  return cmd;
}
