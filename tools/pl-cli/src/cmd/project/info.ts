import { Command } from "commander";
import { connect } from "../../base_command";
import { addOptions, GlobalOptions, UserAuthOptions, AdminTargetOptions } from "../../cmd-opts";
import { resolveProject, getProjectInfo } from "../../project_ops";
import { formatDate, outputJson, outputText } from "../../output";
import { resourceIdToString } from "@milaboratories/pl-client";

export default function projectInfoCommand(): Command {
  const cmd = new Command("info").description("Show detailed information about a project.");

  cmd.argument("<project>", "Project ID or label");
  addOptions(cmd, GlobalOptions(), UserAuthOptions(), AdminTargetOptions());

  cmd.action(async (project: string, flags) => {
    const { pl, projectListRid } = await connect(flags);
    try {
      const { id, rid } = await resolveProject(pl, projectListRid, project);
      const info = await getProjectInfo(pl, id, rid);

      if (flags.format === "json") {
        outputJson({
          id: info.id,
          rid: resourceIdToString(info.rid),
          label: info.label,
          schemaVersion: info.schemaVersion,
          blockCount: info.blockCount,
          blockIds: info.blockIds,
          created: info.created.toISOString(),
          lastModified: info.lastModified.toISOString(),
        });
      } else {
        outputText(`Project: ${info.label}`);
        outputText(`ID:      ${info.id}`);
        outputText(`RID:     ${resourceIdToString(info.rid)}`);
        outputText(`Schema:  ${info.schemaVersion ?? "(unknown)"}`);
        outputText(`Blocks:  ${info.blockCount}`);
        if (info.blockIds.length > 0) {
          for (const bid of info.blockIds) {
            outputText(`  - ${bid}`);
          }
        }
        outputText(`Created:       ${formatDate(info.created)}`);
        outputText(`Last Modified: ${formatDate(info.lastModified)}`);
      }
    } finally {
      await pl.close();
    }
  });

  return cmd;
}
