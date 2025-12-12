import { Command, Flags } from '@oclif/core';
import { BlockRegistryV2 } from '../v2/registry/registry';
import { storageByUrl } from '../io/storage';
import { OclifLoggerAdapter } from '@milaboratories/ts-helpers-oclif';

export default class RestoreOverviewFromSnapshot extends Command {
  static description = 'Restore global overview from a snapshot';

  static flags = {
    'registry': Flags.string({
      char: 'r',
      summary: 'full address of the registry',
      helpValue: '<address>',
      env: 'PL_REGISTRY',
      required: true,
    }),

    'snapshot': Flags.string({
      char: 's',
      summary: 'snapshot timestamp ID to restore from',
      helpValue: '<timestamp>',
      required: true,
    }),

    'skip-confirmation': Flags.boolean({
      summary: 'skip confirmation prompt (use with caution)',
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(RestoreOverviewFromSnapshot);
    const storage = storageByUrl(flags.registry);
    const registry = new BlockRegistryV2(storage, new OclifLoggerAdapter(this));

    // Check if snapshot exists
    const snapshots = await registry.listGlobalOverviewSnapshots();
    const targetSnapshot = snapshots.find((s) => s.timestamp === flags.snapshot);

    if (!targetSnapshot) {
      this.error(`Snapshot '${flags.snapshot}' not found. Available snapshots:\n${
        snapshots.map((s) => `  - ${s.timestamp}`).join('\n') || '  (none)'
      }`);
    }

    // Confirmation prompt (unless skipped)
    if (!flags['skip-confirmation']) {
      const readline = await import('node:readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(
          `⚠️  This will overwrite the current global overview with snapshot '${flags.snapshot}'.\n`
          + `Are you sure you want to continue? (y/N): `,
          resolve,
        );
      });

      rl.close();

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        this.log('Restore cancelled.');
        return;
      }
    }

    // Perform restore
    try {
      await registry.restoreGlobalOverviewFromSnapshot(flags.snapshot);
      this.log(`✅ Successfully restored global overview from snapshot '${flags.snapshot}'`);
    } catch (error) {
      this.error(`Failed to restore from snapshot: ${error}`);
    }
  }
}
