import type { PlClient, SignedResourceId } from "@milaboratories/pl-client";
import { createPlConnection, createAdminPlConnection } from "./connection";
import { getProjectListRid, navigateToUserRoot } from "./project_ops";

/**
 * Low-level: get an authenticated PlClient without resolving a project list.
 * Use this for commands that navigate to multiple users (e.g. admin copy-project).
 *
 * Callers own the returned client and must `await pl.close()` when done.
 */
export async function connectClient(flags: {
  address: string;
  user?: string;
  password?: string;
  adminUser?: string;
  adminPassword?: string;
}): Promise<PlClient> {
  if (flags.adminUser && flags.adminPassword) {
    return createAdminPlConnection({
      address: flags.address,
      adminUser: flags.adminUser,
      adminPassword: flags.adminPassword,
    });
  }
  return createPlConnection({
    address: flags.address,
    user: flags.user,
    password: flags.password,
  });
}

/**
 * Connect and resolve the project list for a single user.
 * In admin mode (--admin-user + --admin-password + --target-user), operates on the target user's data.
 * In user mode, operates on the authenticated user's own data.
 *
 * Callers own the returned client and must `await pl.close()` when done.
 */
export async function connect(flags: {
  address: string;
  user?: string;
  password?: string;
  adminUser?: string;
  adminPassword?: string;
  targetUser?: string;
}): Promise<{ pl: PlClient; projectListRid: SignedResourceId }> {
  const hasAdminUser = !!flags.adminUser;
  const hasAdminPassword = !!flags.adminPassword;
  const hasTarget = !!flags.targetUser;

  // Validate flag combinations
  if (hasTarget && !(hasAdminUser && hasAdminPassword)) {
    throw new Error("--target-user requires --admin-user and --admin-password");
  }
  if ((hasAdminUser || hasAdminPassword) && !hasTarget) {
    throw new Error("--admin-user/--admin-password require --target-user for project commands");
  }

  const pl = await connectClient(flags);

  let projectListRid: SignedResourceId;
  if (hasTarget) {
    const nav = await navigateToUserRoot(pl, flags.targetUser!);
    projectListRid = nav.projectListRid;
  } else {
    projectListRid = await getProjectListRid(pl);
  }

  return { pl, projectListRid };
}
