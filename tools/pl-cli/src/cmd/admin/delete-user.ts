import { Command, Option } from "commander";
import { createInterface } from "node:readline";
import { connectClient } from "../../base_command";
import { addOptions, GlobalOptions, AdminAuthOptions } from "../../cmd-opts";
import {
  ensureUserProjectList,
  listProjectIdentities,
  moveProjects,
  openUserRoot,
} from "../../project_ops";
import type { MovedProject, ProjectIdentityWithLabel } from "../../project_ops";
import { formatTable, outputJson, outputText } from "../../output";

export default function adminDeleteUserCommand(): Command {
  const cmd = new Command("delete-user").description(
    "Delete a user account. Optionally re-homes the user's projects to another user first. " +
      "Requires admin/controller credentials.",
  );

  cmd.argument("<user>", "Username of the account to delete");
  addOptions(cmd, GlobalOptions(), AdminAuthOptions());
  cmd.addOption(
    new Option(
      "--move-projects-to <user>",
      "Re-home the deleted user's projects to this user before deleting the account",
    ),
  );
  cmd.addOption(
    new Option(
      "--delete-projects",
      "Delete the user's projects along with the account, losing their data",
    ),
  );
  cmd.option("--force", "Skip confirmation", false);

  cmd.action(async (user: string, flags) => {
    // The two modes are alternatives, not a combination: one keeps the projects, the other
    // destroys them, and a request for both says nothing about which was meant.
    if (flags.moveProjectsTo && flags.deleteProjects) {
      throw new Error("--move-projects-to and --delete-projects are mutually exclusive");
    }
    if (flags.moveProjectsTo === user) {
      throw new Error("--move-projects-to must name a different user than the one being deleted");
    }
    // Caught here as well as server-side, where it is authoritative: the operator gets the reason
    // instead of a failure from whichever lookup happens to run first.
    if (flags.adminUser === user) {
      throw new Error(
        `Refusing to delete "${user}" — it is the account these credentials authenticate as.`,
      );
    }

    const pl = await connectClient(flags);
    try {
      const source = await openUserRoot(pl, user);
      // No project list means the account never opened the app, so it owns nothing — a state to
      // delete straight through, not to fail on.
      const projects =
        source.projectListRid === undefined
          ? []
          : await listProjectIdentities(pl, source.projectListRid);

      // Neither mode given while the account still owns projects: refuse rather than pick. Both
      // defaults are wrong to assume — one silently destroys data, the other silently hands it to
      // someone. An account with no projects has nothing to decide about, so it just proceeds.
      if (projects.length > 0 && !flags.moveProjectsTo && !flags.deleteProjects) {
        throw new Error(
          `User "${user}" owns ${projects.length} project(s). Pass --move-projects-to <user> to ` +
            "re-home them, or --delete-projects to delete them with the account.",
        );
      }

      const confirmed = await confirmDeletion(user, projects, flags);
      if (!confirmed) {
        outputText("Aborted.");
        return;
      }

      let moved: MovedProject[] = [];
      if (flags.moveProjectsTo && projects.length > 0) {
        const target = await openUserRoot(pl, flags.moveProjectsTo);
        // Created if the target has none, so re-homing to a user who has never opened the app
        // works rather than failing halfway with the account still present.
        const targetList = await ensureUserProjectList(pl, target.userRoot);
        moved = await moveProjects(pl, source.projectListRid!, targetList, projects);
      }

      // Deleting the account takes its root with it, and with the root every project still
      // attached — which is why the move above has to have committed first.
      const report = await pl.deleteUser(user);

      if (flags.format === "json") {
        outputJson({
          deleted: true,
          user,
          movedTo: flags.moveProjectsTo ?? null,
          movedProjects: moved,
          deletedProjects: flags.moveProjectsTo ? [] : projects.map((p) => p.label),
          userRootId: report.userRootId === undefined ? null : report.userRootId.toString(),
          userRootDeleted: report.userRootDeleted,
          revokedGrants: report.revokedGrants,
          removedIdentityIndexEntries: report.removedIdentityIndexEntries,
        });
      } else {
        outputText(renderResult(user, flags.moveProjectsTo, moved, projects));
      }
    } finally {
      await pl.close();
    }
  });

  return cmd;
}

/** Asks the operator to confirm, spelling out which projects are affected and how. */
async function confirmDeletion(
  user: string,
  projects: ProjectIdentityWithLabel[],
  flags: { moveProjectsTo?: string; force?: boolean },
): Promise<boolean> {
  if (flags.force) return true;

  const fate = flags.moveProjectsTo
    ? `${projects.length} project(s) will move to "${flags.moveProjectsTo}"`
    : projects.length > 0
      ? `${projects.length} project(s) will be PERMANENTLY DELETED`
      : "the account owns no projects";

  process.stderr.write(`Delete user "${user}"? ${fate}.\n`);
  if (projects.length > 0) {
    process.stderr.write(projects.map((p) => `  - ${p.label}`).join("\n") + "\n");
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await new Promise<string>((resolve) => {
      rl.question("Proceed? [y/N] ", resolve);
    });
    return answer.toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

function renderResult(
  user: string,
  movedTo: string | undefined,
  moved: MovedProject[],
  projects: ProjectIdentityWithLabel[],
): string {
  const lines: string[] = [];

  if (movedTo) {
    if (moved.length > 0) {
      lines.push(`Moved ${moved.length} project(s) from ${user} to ${movedTo}:`);
      lines.push(
        formatTable(
          ["id", "name", "name in target"],
          moved.map((p) => [p.id, p.sourceLabel, p.targetLabel]),
        ),
      );
    } else {
      lines.push(`User ${user} had no projects to move.`);
    }
  } else if (projects.length > 0) {
    lines.push(`Deleted ${projects.length} project(s) belonging to ${user}:`);
    lines.push(projects.map((p) => `  - ${p.label}`).join("\n"));
  }

  lines.push(`Deleted user "${user}".`);
  return lines.join("\n");
}
