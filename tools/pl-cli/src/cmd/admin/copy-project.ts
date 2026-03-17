import { Flags } from "@oclif/core";
import { field, toGlobalResourceId, isNullResourceId } from "@milaboratories/pl-client";
import { ProjectMetaKey } from "@milaboratories/pl-middle-layer";
import { randomUUID } from "node:crypto";
import { PlCommand } from "../../base_command";
import { GlobalFlags, AdminAuthFlags } from "../../cmd-opts";
import {
  resolveProject,
  deduplicateName,
  duplicateProject,
  navigateToUserRoot,
} from "../../project_ops";
import { outputJson } from "../../output";

export default class AdminCopyProject extends PlCommand {
  static override description =
    "Copy a project from one user to another. Requires admin/controller credentials.";

  static override flags = {
    ...GlobalFlags,
    ...AdminAuthFlags,
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
    const pl = await this.connectClient(flags);

    const targetUser = flags["target-user"] ?? flags["source-user"];

    const source = await navigateToUserRoot(pl, flags["source-user"]);
    const { rid: sourceRid } = await resolveProject(
      pl,
      source.projectListRid,
      flags["source-project"],
    );

    const target =
      targetUser === flags["source-user"] ? source : await navigateToUserRoot(pl, targetUser);

    const newId = randomUUID();

    const result = await pl.withWriteTx("adminCopyProject", async (tx) => {
      const sourceMetaStr = await tx.getKValueString(sourceRid, ProjectMetaKey);
      const sourceMeta = JSON.parse(sourceMetaStr);
      const sourceLabel: string = sourceMeta.label;

      const targetData = await tx.getResourceData(target.projectListRid, true);
      const existingLabels: string[] = [];
      for (const f of targetData.fields) {
        if (isNullResourceId(f.value)) continue;
        const metaStr = await tx.getKValueStringIfExists(f.value, ProjectMetaKey);
        if (metaStr) {
          existingLabels.push(JSON.parse(metaStr).label);
        }
      }

      let newLabel: string = flags.name ?? sourceLabel;

      if (existingLabels.includes(newLabel)) {
        if (!flags["auto-rename"]) {
          throw new Error(`Project name "${newLabel}" already exists for target user.`);
        }
        newLabel = deduplicateName(flags.name ?? sourceLabel, existingLabels);
      }

      const newPrj = await duplicateProject(tx, sourceRid, { label: newLabel });
      tx.createField(field(target.projectListRid, newId), "Dynamic", newPrj);
      await tx.commit();

      return { rid: await toGlobalResourceId(newPrj), label: newLabel };
    });

    if (flags.format === "json") {
      outputJson({
        id: newId,
        rid: String(result.rid),
        label: result.label,
        sourceUser: flags["source-user"],
        targetUser,
      });
    } else {
      console.log(
        `Copied project from ${flags["source-user"]} to ${targetUser} as "${result.label}" (id: ${newId})`,
      );
    }
  }
}
