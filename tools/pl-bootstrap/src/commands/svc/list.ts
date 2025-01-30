import { Command } from '@oclif/core';
import state from '../../state';

export default class List extends Command {
  static override description = 'List available instances';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = { };

  public async run(): Promise<void> {
    await this.parse(List);

    const instances = state.instanceList;
    const currentInstance = state.currentInstanceName;

    for (const iName of instances) {
      const statusReport = [];
      const instance = state.getInstanceInfo(iName);
      if (state.isInstanceActive(instance)) statusReport.push('status:up');
      statusReport.push(`type:${instance.type}`);

      if (iName === currentInstance) {
        console.log(` * ${iName} (${statusReport.join(', ')})`);
      } else {
        console.log(`   ${iName} (${statusReport.join(', ')})`);
      }
    }
  }
}
