import { Args, Flags } from "@oclif/core";
import { field, toGlobalResourceId } from "@milaboratories/pl-client";
import { ProjectMetaKey } from "@milaboratories/pl-middle-layer";
import { randomUUID } from "node:crypto";
import { PlCommand } from "../../base_command";
import {
  resolveProject,
  deduplicateName,
  duplicateProject,
  getExistingLabelsInTx,
} from "../../project_ops";
import { outputJson, outputText } from "../../output";

export default class ProjectDuplicate extends PlCommand {
  static override description =
    "Duplicate a project within the same user. Auto-renames on collision by default.";

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
      summary: "Name for the duplicate",
      helpValue: "<name>",
    }),
    "auto-rename": Flags.boolean({
      summary: "Auto-rename on collision (default: true)",
      default: true,
      allowNo: true,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectDuplicate);
    const { pl, projectListRid } = await this.connect(flags);

    const { rid: sourceRid } = await resolveProject(pl, projectListRid, args.project);

    const newId = randomUUID();

    const newRid = await pl.withWriteTx("duplicateProject", async (tx) => {
      const sourceMetaStr = await tx.getKValueString(sourceRid, ProjectMetaKey);
      const sourceMeta = JSON.parse(sourceMetaStr);
      const sourceLabel: string = sourceMeta.label;

      const existingLabels = await getExistingLabelsInTx(tx, projectListRid);

      // Compute new label
      let newLabel: string;
      if (flags.name) {
        if (!flags["auto-rename"] && existingLabels.includes(flags.name)) {
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

      return { rid: await toGlobalResourceId(newPrj), label: newLabel };
    });

    if (flags.format === "json") {
      outputJson({ id: newId, rid: String(newRid.rid), label: newRid.label });
    } else {
      outputText(`Duplicated project as "${newRid.label}" (id: ${newId})`);
    }
  }
}
