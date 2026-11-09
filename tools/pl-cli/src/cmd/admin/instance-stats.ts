import { Command } from "commander";
import { InstanceStatsContextTypeName, parseInstanceStats } from "@milaboratories/pl-middle-layer";
import { connectClient } from "../../base_command";
import { addOptions, GlobalOptions, AdminAuthOptions } from "../../cmd-opts";
import { outputJson } from "../../output";

export default function adminInstanceStatsCommand(): Command {
  const cmd = new Command("instance-stats").description("Show the instance statistics as JSON.");
  addOptions(cmd, GlobalOptions(), AdminAuthOptions());

  cmd.action(async (flags) => {
    const pl = await connectClient(flags);
    try {
      const [context] = await pl.listSharedResourcesByType(InstanceStatsContextTypeName);
      if (context === undefined) throw new Error("The instance has no instance statistics.");
      const kvs = await pl.withReadTx("instanceStats", (tx) => tx.listKeyValuesString(context));
      outputJson(parseInstanceStats(kvs));
    } finally {
      await pl.close();
    }
  });

  return cmd;
}
