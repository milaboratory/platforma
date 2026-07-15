import { Command, Option } from "commander";
import { field, resourceIdToString } from "@milaboratories/pl-client";
import { ProjectMetaKey } from "@milaboratories/pl-middle-layer";
import { randomUUID } from "node:crypto";
import { connect } from "../../base_command";
import { addOptions, GlobalOptions, UserAuthOptions, AdminTargetOptions } from "../../cmd-opts";
import {
  resolveProject,
  deduplicateName,
  duplicateProject,
  getExistingLabelsInTx,
} from "../../project_ops";
import { outputJson, outputText } from "../../output";

export default function projectDuplicateCommand(): Command {
  const cmd = new Command("duplicate").description(
    "Duplicate a project within the same user. Auto-renames on collision by default.",
  );

  cmd.argument("<project>", "Project ID or label");
  addOptions(cmd, GlobalOptions(), UserAuthOptions(), AdminTargetOptions());
  cmd.option("-n, --name <name>", "Name for the duplicate");
  cmd.addOption(
    new Option("--auto-rename", "Auto-rename on collision (default: true)").default(true),
  );
  cmd.option("--no-auto-rename", "Fail on name collision instead of auto-renaming");

  cmd.action(async (project: string, flags) => {
    const { pl, projectListRid } = await connect(flags);
    try {
      const { rid: sourceRid } = await resolveProject(pl, projectListRid, project);

      const newId = randomUUID();

      const result = await pl.withWriteTx("duplicateProject", async (tx) => {
        const sourceMetaStr = await tx.getKValueString(sourceRid, ProjectMetaKey);
        const sourceMeta = JSON.parse(sourceMetaStr);
        const sourceLabel: string = sourceMeta.label;

        const existingLabels = await getExistingLabelsInTx(tx, projectListRid);

        // Compute new label
        let newLabel: string;
        if (flags.name) {
          if (!flags.autoRename && existingLabels.includes(flags.name)) {
            throw new Error(`Project name "${flags.name}" already exists.`);
          }
          newLabel = existingLabels.includes(flags.name)
            ? deduplicateName(flags.name, existingLabels)
            : flags.name;
        } else {
          newLabel = deduplicateName(sourceLabel, existingLabels);
        }

        const newPrj = await duplicateProject(tx, sourceRid, { label: newLabel });
        tx.createField(field(projectListRid, newId), "Dynamic", newPrj);
        await tx.commit();

        const projectResourceId = await newPrj.globalId;
        const projectId = resourceIdToString(projectResourceId);
        return { id: projectId, rid: projectResourceId, label: newLabel };
      });

      if (flags.format === "json") {
        outputJson({ id: result.id, rid: resourceIdToString(result.rid), label: result.label });
      } else {
        outputText(`Duplicated project as "${result.label}" (id: ${result.id})`);
      }
    } finally {
      await pl.close();
    }
  });

  return cmd;
}
