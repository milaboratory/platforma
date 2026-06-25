import { Command, Option } from "commander";
import { field, resourceIdToString } from "@milaboratories/pl-client";
import { ProjectMetaKey } from "@milaboratories/pl-middle-layer";
import { randomUUID } from "node:crypto";
import { connectClient } from "../../base_command";
import { addOptions, GlobalOptions, AdminAuthOptions } from "../../cmd-opts";
import {
  resolveProject,
  deduplicateName,
  duplicateProject,
  getExistingLabelsInTx,
  navigateToUserRoot,
} from "../../project_ops";
import { outputJson, outputText } from "../../output";

export default function adminCopyProjectCommand(): Command {
  const cmd = new Command("copy-project").description(
    "Copy a project from one user to another. Requires admin/controller credentials.",
  );

  addOptions(cmd, GlobalOptions(), AdminAuthOptions());
  cmd.addOption(
    new Option(
      "--source-user <user>",
      "Username of the source project owner",
    ).makeOptionMandatory(),
  );
  cmd.addOption(
    new Option("--source-project <project>", "Source project ID or label").makeOptionMandatory(),
  );
  cmd.option(
    "--target-user <user>",
    "Username of the target user (defaults to source-user for same-user copy)",
  );
  cmd.option("-n, --name <name>", "Name for the copied project");
  cmd.addOption(
    new Option("--auto-rename", "Auto-rename on collision (default: true)").default(true),
  );
  cmd.option("--no-auto-rename", "Fail on name collision instead of auto-renaming");

  cmd.action(async (flags) => {
    const pl = await connectClient(flags);
    try {
      const targetUser = flags.targetUser ?? flags.sourceUser;

      const source = await navigateToUserRoot(pl, flags.sourceUser);
      const { rid: sourceRid } = await resolveProject(
        pl,
        source.projectListRid,
        flags.sourceProject,
      );

      const target =
        targetUser === flags.sourceUser ? source : await navigateToUserRoot(pl, targetUser);

      const newId = randomUUID();

      const result = await pl.withWriteTx("adminCopyProject", async (tx) => {
        const sourceMetaStr = await tx.getKValueString(sourceRid, ProjectMetaKey);
        const sourceMeta = JSON.parse(sourceMetaStr);
        const sourceLabel: string = sourceMeta.label;

        const existingLabels = await getExistingLabelsInTx(tx, target.projectListRid);

        let newLabel: string = flags.name ?? sourceLabel;

        if (existingLabels.includes(newLabel)) {
          if (!flags.autoRename) {
            throw new Error(`Project name "${newLabel}" already exists for target user.`);
          }
          newLabel = deduplicateName(flags.name ?? sourceLabel, existingLabels);
        }

        const newPrj = await duplicateProject(tx, sourceRid, { label: newLabel });
        tx.createField(field(target.projectListRid, newId), "Dynamic", newPrj);
        await tx.commit();

        const prjResourceId = await newPrj.globalId;
        const prjId = resourceIdToString(prjResourceId);
        return { id: prjId, rid: prjResourceId, label: newLabel };
      });

      if (flags.format === "json") {
        outputJson({
          id: result.id,
          rid: resourceIdToString(result.rid),
          label: result.label,
          sourceUser: flags.sourceUser,
          targetUser,
        });
      } else {
        outputText(
          `Copied project from ${flags.sourceUser} to ${targetUser} as "${result.label}" (id: ${result.id}, rid: ${resourceIdToString(result.rid)})`,
        );
      }
    } finally {
      await pl.close();
    }
  });

  return cmd;
}
