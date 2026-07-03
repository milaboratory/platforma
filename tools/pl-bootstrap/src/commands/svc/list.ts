import { Command } from "commander";
import state from "../../state";

export default function svcListCommand(): Command {
  const cmd = new Command("list").description("List available instances");

  cmd.action(() => {
    const instances = state.instanceList;
    const currentInstance = state.currentInstanceName;

    for (const iName of instances) {
      const statusReport = [];
      const instance = state.getInstanceInfo(iName);
      if (state.isInstanceActive(instance)) statusReport.push("status:up");
      statusReport.push(`type:${instance.type}`);

      if (iName === currentInstance) {
        console.log(` * ${iName} (${statusReport.join(", ")})`);
      } else {
        console.log(`   ${iName} (${statusReport.join(", ")})`);
      }
    }
  });

  return cmd;
}
