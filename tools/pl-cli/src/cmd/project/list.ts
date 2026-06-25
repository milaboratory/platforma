import { Command } from "commander";
import { connect } from "../../base_command";
import { addOptions, GlobalOptions, UserAuthOptions, AdminTargetOptions } from "../../cmd-opts";
import { listProjects } from "../../project_ops";
import { formatTable, formatDate, outputJson, outputText } from "../../output";
import { resourceIdToString } from "@milaboratories/pl-client";

export default function projectListCommand(): Command {
  const cmd = new Command("list").description("List all projects for the authenticated user.");

  addOptions(cmd, GlobalOptions(), UserAuthOptions(), AdminTargetOptions());

  cmd.action(async (flags) => {
    const { pl, projectListRid } = await connect(flags);
    try {
      const projects = await listProjects(pl, projectListRid);

      if (flags.format === "json") {
        outputJson(
          projects.map((p) => ({
            id: p.id,
            rid: resourceIdToString(p.rid),
            label: p.label,
            created: p.created.toISOString(),
            lastModified: p.lastModified.toISOString(),
          })),
        );
      } else {
        if (projects.length === 0) {
          outputText("No projects found.");
          return;
        }

        outputText(
          formatTable(
            ["ID", "RID", "LABEL", "CREATED", "LAST MODIFIED"],
            projects.map((p) => [
              p.id,
              resourceIdToString(p.rid),
              p.label,
              formatDate(p.created),
              formatDate(p.lastModified),
            ]),
          ),
        );
        outputText(`\n${projects.length} project(s)`);
      }
    } finally {
      await pl.close();
    }
  });

  return cmd;
}
