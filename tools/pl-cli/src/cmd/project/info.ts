import { Args } from "@oclif/core";
import { PlCommand } from "../../base_command";
import { resolveProject, getProjectInfo } from "../../project_ops";
import { formatDate, outputJson, outputText } from "../../output";
import { resourceIdToString } from "@milaboratories/pl-client";

export default class ProjectInfo extends PlCommand {
  static override description = "Show detailed information about a project.";

  static override args = {
    project: Args.string({
      description: "Project ID or label",
      required: true,
    }),
  };

  static override flags = {
    ...PlCommand.baseFlags,
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectInfo);
    const { pl, projectListRid } = await this.connect(flags);
    const { id, rid } = await resolveProject(pl, projectListRid, args.project);
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
  }
}
