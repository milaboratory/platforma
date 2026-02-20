import { Command, Flags } from "@oclif/core";
import { BlockRegistryV2 } from "../v2/registry/registry";
import { storageByUrl } from "../io/storage";
import { OclifLoggerAdapter } from "@milaboratories/ts-helpers-oclif";

export default class ListOverviewSnapshots extends Command {
  static description = "List all available global overview snapshots in the registry";

  static flags = {
    registry: Flags.string({
      char: "r",
      summary: "full address of the registry",
      helpValue: "<address>",
      env: "PL_REGISTRY",
      required: true,
    }),

    json: Flags.boolean({
      summary: "output in JSON format",
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ListOverviewSnapshots);
    const storage = storageByUrl(flags.registry);
    const registry = new BlockRegistryV2(storage, new OclifLoggerAdapter(this));

    const snapshots = await registry.listGlobalOverviewSnapshots();

    if (flags.json) {
      this.log(JSON.stringify(snapshots, null, 2));
    } else {
      if (snapshots.length === 0) {
        this.log("No snapshots found.");
      } else {
        this.log(`Found ${snapshots.length} snapshot(s):\n`);
        for (const snapshot of snapshots) {
          this.log(`  ${snapshot.timestamp}`);
          this.log(`    Path: ${snapshot.path}`);
          this.log("");
        }
      }
    }
  }
}
