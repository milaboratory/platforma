import { Args, Flags } from "@oclif/core";
import { PlCommand } from "../../base_command";
import { resolveProject, renameProject } from "../../project_ops";
import { outputJson } from "../../output";

export default class ProjectRename extends PlCommand {
  static override description = "Rename a project.";

  static override args = {
    project: Args.string({
      description: "Project ID or label",
      required: true,
    }),
  };

  static override flags = {
    ...PlCommand.baseFlags,
    name: Flags.string({
      char: "n",
      summary: "New name for the project",
      helpValue: "<name>",
      required: true,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectRename);
    const { pl, projectListRid } = await this.connect(flags);
    const { id, rid } = await resolveProject(pl, projectListRid, args.project);

    await renameProject(pl, rid, flags.name);

    if (flags.format === "json") {
      outputJson({ id, rid: String(rid), label: flags.name });
    } else {
      console.log(`Renamed project to "${flags.name}"`);
    }
  }
}
