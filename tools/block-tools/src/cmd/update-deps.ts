import { Command } from '@oclif/core';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

export default class UpdateDeps extends Command {
  static override description
    = 'Updates @platforma-sdk and @milaboratories packages in pnpm-workspace.yaml catalog to their latest versions from npm registry.';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  // eslint-disable-next-line @typescript-eslint/require-await -- oclif requires async but implementation is sync
  public async run(): Promise<void> {
    const require = createRequire(import.meta.url);
    const updaterPath = require.resolve('@platforma-sdk/blocks-deps-updater/scripts/updater.js');

    execFileSync(process.execPath, [updaterPath], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  }
}
