import { Args } from "@oclif/core";
import { PlCommand } from "../../base_command";
import { resolveProject, getProjectInfo, getProjectListRid } from "../../project_ops";
import { formatDate, outputJson } from "../../output";

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
    const pl = await this.connect(flags);
    const projectListRid = await getProjectListRid(pl);
    const { id } = await resolveProject(pl, projectListRid, args.project);
    const info = await getProjectInfo(pl, projectListRid, id);

    if (flags.format === "json") {
      outputJson({
        id: info.id,
        rid: info.rid,
        label: info.label,
        schemaVersion: info.schemaVersion,
        blockCount: info.blockCount,
        blockIds: info.blockIds,
        created: info.created.toISOString(),
        lastModified: info.lastModified.toISOString(),
      });
    } else {
      console.log(`Project: ${info.label}`);
      console.log(`ID:      ${info.id}`);
      console.log(`RID:     ${info.rid}`);
      console.log(`Schema:  ${info.schemaVersion ?? "(unknown)"}`);
      console.log(`Blocks:  ${info.blockCount}`);
      if (info.blockIds.length > 0) {
        for (const bid of info.blockIds) {
          console.log(`  - ${bid}`);
        }
      }
      console.log(`Created:       ${formatDate(info.created)}`);
      console.log(`Last Modified: ${formatDate(info.lastModified)}`);
    }
  }
}
