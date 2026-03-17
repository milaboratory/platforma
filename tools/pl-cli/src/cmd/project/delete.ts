import { Args, Flags } from "@oclif/core";
import { PlCommand } from "../../base_command";
import {
  resolveProject,
  deleteProject,
  getProjectInfo,
  getProjectListRid,
} from "../../project_ops";
import { outputJson } from "../../output";

export default class ProjectDelete extends PlCommand {
  static override description = "Delete a project. This permanently destroys all project data.";

  static override args = {
    project: Args.string({
      description: "Project ID or label",
      required: true,
    }),
  };

  static override flags = {
    ...PlCommand.baseFlags,
    force: Flags.boolean({
      summary: "Skip confirmation",
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectDelete);
    const pl = await this.connect(flags);
    const projectListRid = await getProjectListRid(pl);
    const { id } = await resolveProject(pl, projectListRid, args.project);

    const info = await getProjectInfo(pl, projectListRid, id);

    if (!flags.force) {
      const readline = await import("node:readline");
      const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
      const answer = await new Promise<string>((resolve) => {
        rl.question(`Delete project "${info.label}" (${info.blockCount} blocks)? [y/N] `, resolve);
      });
      rl.close();
      if (answer.toLowerCase() !== "y") {
        console.log("Aborted.");
        return;
      }
    }

    await deleteProject(pl, projectListRid, id);

    if (flags.format === "json") {
      outputJson({ deleted: true, id, label: info.label });
    } else {
      console.log(`Deleted project "${info.label}"`);
    }
  }
}
