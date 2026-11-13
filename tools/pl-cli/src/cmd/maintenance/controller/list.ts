import { Command } from "commander";
import { listRegisteredControllers, resourceIdToString } from "@milaboratories/pl-client";
import { connectClient } from "../../../base_command";
import { addOptions, AdminAuthOptions, GlobalOptions } from "../../../cmd-opts";
import { formatTable, outputCsv, outputJson, outputText } from "../../../output";
import { readFixupLevel } from "./fixup_level";

export default function maintenanceControllerListCommand(): Command {
  const cmd = new Command("list").description(
    "List the controllers registered in the backend, with their IDs and resources fixup levels. " +
      "Requires admin/controller credentials.",
  );

  addOptions(cmd, GlobalOptions("text", ["text", "json", "csv"]), AdminAuthOptions());

  cmd.action(async (flags) => {
    const pl = await connectClient(flags);
    try {
      const controllers = await pl.withReadTx("listControllers", async (tx) => {
        const list = await listRegisteredControllers(tx);
        return await Promise.all(
          list.map(async (c) => ({
            id: resourceIdToString(c.id),
            type: c.type,
            fixupLevel: await readFixupLevel(tx, c.type),
          })),
        );
      });

      const headers = ["id", "type", "fixup level"];
      const rows = controllers.map((c) => [c.id, c.type, c.fixupLevel]);
      if (flags.format === "json") outputJson(controllers);
      else if (flags.format === "csv") outputCsv(headers, rows);
      else outputText(formatTable(headers, rows));
    } finally {
      await pl.close();
    }
  });

  return cmd;
}
