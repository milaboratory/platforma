import { Flags } from "@oclif/core";
import { field, toGlobalResourceId, isNullResourceId } from "@milaboratories/pl-client";
import { randomUUID } from "node:crypto";
import { AdminCommand } from "../../admin_base_command";
import { navigateToUserRoot } from "../../admin_connection";
import { resolveProject, deduplicateName, duplicateProjectInTx } from "../../project_ops";
import { output } from "../../output";

export default class AdminCopyProject extends AdminCommand {
  static override description =
    "Copy a project from one user to another. Requires admin/controller credentials.";

  static override flags = {
    ...AdminCommand.baseFlags,
    "source-user": Flags.string({
      summary: "Username of the source project owner",
      required: true,
    }),
    "source-project": Flags.string({
      summary: "Source project ID or label",
      required: true,
    }),
    "target-user": Flags.string({
      summary: "Username of the target user (defaults to source-user for same-user copy)",
    }),
    name: Flags.string({
      char: "n",
      summary: "Name for the copied project",
      helpValue: "<name>",
    }),
    "auto-rename": Flags.boolean({
      summary: "Auto-rename on collision (default: true)",
      default: true,
      allowNo: true,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AdminCopyProject);
    const pl = await this.connectAdmin(flags);

    const targetUser = flags["target-user"] ?? flags["source-user"];

    // Navigate to source user's projects
    const source = await navigateToUserRoot(pl, flags["source-user"]);
    const { rid: sourceRid } = await resolveProject(
      pl,
      source.projectListRid,
      flags["source-project"],
    );

    // Navigate to target user's projects
    const target =
      targetUser === flags["source-user"] ? source : await navigateToUserRoot(pl, targetUser);

    const newId = randomUUID();

    const result = await pl.withWriteTx("adminCopyProject", async (tx) => {
      // Read source label
      const sourceMetaStr = await tx.getKValueString(sourceRid, "ProjectMeta");
      const sourceMeta = JSON.parse(sourceMetaStr);
      const sourceLabel: string = sourceMeta.label;

      // Read target's existing labels
      const targetData = await tx.getResourceData(target.projectListRid, true);
      const existingLabels: string[] = [];
      for (const f of targetData.fields) {
        if (isNullResourceId(f.value)) continue;
        const metaStr = await tx.getKValueStringIfExists(f.value, "ProjectMeta");
        if (metaStr) {
          existingLabels.push(JSON.parse(metaStr).label);
        }
      }

      // Compute new label
      let newLabel: string;
      if (flags.name) {
        newLabel = flags.name;
      } else {
        newLabel = sourceLabel;
      }

      if (existingLabels.includes(newLabel)) {
        if (!flags["auto-rename"]) {
          throw new Error(`Project name "${newLabel}" already exists for target user.`);
        }
        newLabel = deduplicateName(flags.name ?? sourceLabel, existingLabels);
      }

      const newPrj = await duplicateProjectInTx(tx, sourceRid, { label: newLabel });
      tx.createField(field(target.projectListRid, newId), "Dynamic", newPrj);
      await tx.commit();

      return { rid: await toGlobalResourceId(newPrj), label: newLabel };
    });

    if (flags.format === "json") {
      output(
        {
          id: newId,
          rid: String(result.rid),
          label: result.label,
          sourceUser: flags["source-user"],
          targetUser,
        },
        "json",
      );
    } else {
      console.log(
        `Copied project from ${flags["source-user"]} to ${targetUser} as "${result.label}" (id: ${newId})`,
      );
    }
  }
}
