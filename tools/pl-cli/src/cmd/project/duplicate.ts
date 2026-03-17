import { Args, Flags } from "@oclif/core";
import { field, toGlobalResourceId } from "@milaboratories/pl-client";
import { randomUUID } from "node:crypto";
import { PlCommand } from "../../base_command";
import { resolveProject, deduplicateName, duplicateProjectInTx } from "../../project_ops";
import { output } from "../../output";

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
      summary: "Name for the duplicate (auto-renames on collision unless --no-auto-rename)",
      helpValue: "<name>",
    }),
    "no-auto-rename": Flags.boolean({
      summary: "Fail if the name already exists instead of auto-renaming",
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectDuplicate);
    const pl = await this.connect(flags);
    const projectListRid = await this.getProjectListRid(pl);

    const { rid: sourceRid } = await resolveProject(pl, projectListRid, args.project);

    const newId = randomUUID();

    const newRid = await pl.withWriteTx("duplicateProject", async (tx) => {
      // Read source label
      const sourceMetaStr = await tx.getKValueString(sourceRid, "ProjectMeta");
      const sourceMeta = JSON.parse(sourceMetaStr);
      const sourceLabel: string = sourceMeta.label;

      // Read all existing labels
      const data = await tx.getResourceData(projectListRid, true);
      const existingLabels: string[] = [];
      for (const f of data.fields) {
        const { isNullResourceId: isNull } = await import("@milaboratories/pl-client");
        if (isNull(f.value)) continue;
        const metaStr = await tx.getKValueStringIfExists(f.value, "ProjectMeta");
        if (metaStr) {
          existingLabels.push(JSON.parse(metaStr).label);
        }
      }

      // Compute new label
      let newLabel: string;
      if (flags.name) {
        if (flags["no-auto-rename"] && existingLabels.includes(flags.name)) {
          throw new Error(`Project name "${flags.name}" already exists.`);
        }
        newLabel = existingLabels.includes(flags.name)
          ? deduplicateName(flags.name, existingLabels)
          : flags.name;
      } else {
        newLabel = deduplicateName(sourceLabel, existingLabels);
      }

      const newPrj = await duplicateProjectInTx(tx, sourceRid, { label: newLabel });
      tx.createField(field(projectListRid, newId), "Dynamic", newPrj);
      await tx.commit();

      return { rid: await toGlobalResourceId(newPrj), label: newLabel };
    });

    if (flags.format === "json") {
      output({ id: newId, rid: String(newRid.rid), label: newRid.label }, "json");
    } else {
      console.log(`Duplicated project as "${newRid.label}" (id: ${newId})`);
    }
  }
}
