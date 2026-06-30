import { Command, Option } from "commander";
import { BlockRegistryV2 } from "../v2/registry/registry";
import { storageByUrl } from "../io/storage";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";

export function restoreOverviewFromSnapshotCommand(): Command {
  const cmd = new Command("restore-overview-from-snapshot").description(
    "Restore global overview from a snapshot",
  );

  cmd.addOption(
    new Option("-r, --registry <address>", "full address of the registry")
      .env("PL_REGISTRY")
      .makeOptionMandatory(),
  );
  cmd.requiredOption("-s, --snapshot <timestamp>", "snapshot timestamp ID to restore from");
  cmd.option("--skip-confirmation", "skip confirmation prompt (use with caution)", false);

  cmd.action(async (flags) => {
    const logger = new ConsoleLoggerAdapter();
    const storage = storageByUrl(flags.registry);
    const registry = new BlockRegistryV2(storage, logger);

    // Check if snapshot exists
    const snapshots = await registry.listGlobalOverviewSnapshots();
    const targetSnapshot = snapshots.find((s) => s.timestamp === flags.snapshot);

    if (!targetSnapshot) {
      throw new Error(
        `Snapshot '${flags.snapshot}' not found. Available snapshots:\n${
          snapshots.map((s) => `  - ${s.timestamp}`).join("\n") || "  (none)"
        }`,
      );
    }

    // Confirmation prompt (unless skipped)
    if (!flags.skipConfirmation) {
      const readline = await import("node:readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(
          `⚠️  This will overwrite the current global overview with snapshot '${flags.snapshot}'.\n` +
            `Are you sure you want to continue? (y/N): `,
          resolve,
        );
      });

      rl.close();

      if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
        logger.info("Restore cancelled.");
        return;
      }
    }

    // Perform restore
    try {
      await registry.restoreGlobalOverviewFromSnapshot(flags.snapshot);
      logger.info(`✅ Successfully restored global overview from snapshot '${flags.snapshot}'`);
    } catch (error) {
      throw new Error(`Failed to restore from snapshot: ${String(error)}`);
    }
  });

  return cmd;
}
