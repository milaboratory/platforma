import { PlCommand } from "../../base_command";
import { listProjects } from "../../project_ops";
import { formatTable, formatDate, outputJson, outputText } from "../../output";
import { resourceIdToString } from "@milaboratories/pl-client";

export default class ProjectList extends PlCommand {
  static override description = "List all projects for the authenticated user.";

  static override flags = {
    ...PlCommand.baseFlags,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ProjectList);
    const { pl, projectListRid } = await this.connect(flags);
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
  }
}
