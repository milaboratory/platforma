import { Command } from "commander";
import { createInterface } from "node:readline";
import { connect } from "../../base_command";
import { addOptions, GlobalOptions, UserAuthOptions, AdminTargetOptions } from "../../cmd-opts";
import { resolveProject, deleteProject, getProjectInfo } from "../../project_ops";
import { outputJson, outputText } from "../../output";

export default function projectDeleteCommand(): Command {
  const cmd = new Command("delete").description(
    "Delete a project. This permanently destroys all project data.",
  );

  cmd.argument("<project>", "Project ID or label");
  addOptions(cmd, GlobalOptions(), UserAuthOptions(), AdminTargetOptions());
  cmd.option("--force", "Skip confirmation", false);

  cmd.action(async (project: string, flags) => {
    const { pl, projectListRid } = await connect(flags);
    try {
      const { id, rid, fieldName } = await resolveProject(pl, projectListRid, project);

      const info = await getProjectInfo(pl, id, rid);

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

      await deleteProject(pl, projectListRid, fieldName);

      if (flags.format === "json") {
        outputJson({ deleted: true, id, label: info.label });
      } else {
        outputText(`Deleted project "${info.label}"`);
      }
    } finally {
      await pl.close();
    }
  });

  return cmd;
}
