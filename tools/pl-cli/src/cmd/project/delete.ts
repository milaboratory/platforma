import { Args, Flags } from "@oclif/core";
import { createInterface } from "node:readline";
import { PlCommand } from "../../base_command";
import { resolveProject, deleteProject, getProjectInfo } from "../../project_ops";
import { outputJson, outputText } from "../../output";

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
    const { pl, projectListRid } = await this.connect(flags);
    const { id } = await resolveProject(pl, projectListRid, args.project);

    const info = await getProjectInfo(pl, projectListRid, id);

    if (!flags.force) {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        const answer = await new Promise<string>((resolve) => {
          rl.question(
            `Delete project "${info.label}" (${info.blockCount} blocks)? [y/N] `,
            resolve,
          );
        });
        if (answer.toLowerCase() !== "y") {
          outputText("Aborted.");
          return;
        }
      } finally {
        rl.close();
      }
    }

    await deleteProject(pl, projectListRid, id);

    if (flags.format === "json") {
      outputJson({ deleted: true, id, label: info.label });
    } else {
      outputText(`Deleted project "${info.label}"`);
    }
  }
}
