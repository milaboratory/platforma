import { Command, Option } from "commander";
import { connect } from "../../base_command";
import { addOptions, GlobalOptions, UserAuthOptions, AdminTargetOptions } from "../../cmd-opts";
import { resolveProject, renameProject } from "../../project_ops";
import { outputJson, outputText } from "../../output";
import { resourceIdToString } from "@milaboratories/pl-client";

export default function projectRenameCommand(): Command {
  const cmd = new Command("rename").description("Rename a project.");

  cmd.argument("<project>", "Project ID or label");
  addOptions(cmd, GlobalOptions(), UserAuthOptions(), AdminTargetOptions());
  cmd.addOption(new Option("-n, --name <name>", "New name for the project").makeOptionMandatory());

  cmd.action(async (project: string, flags) => {
    const { pl, projectListRid } = await connect(flags);
    try {
      const { id, rid } = await resolveProject(pl, projectListRid, project);

      await renameProject(pl, rid, flags.name);

      if (flags.format === "json") {
        outputJson({ id, rid: resourceIdToString(rid), label: flags.name });
      } else {
        outputText(`Renamed project to "${flags.name}"`);
      }
    } finally {
      await pl.close();
    }
  });

  return cmd;
}
