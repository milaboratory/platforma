import { Command } from "@oclif/core";
import type { PlClient, ResourceId } from "@milaboratories/pl-client";
import { createPlConnection, createAdminPlConnection } from "./connection";
import { getProjectListRid, navigateToUserRoot } from "./project_ops";
import { GlobalFlags, UserAuthFlags, AdminTargetFlags } from "./cmd-opts";

/** Base command with dual-mode connection: user auth or admin + target-user. */
export abstract class PlCommand extends Command {
  static baseFlags = {
    ...GlobalFlags,
    ...UserAuthFlags,
    ...AdminTargetFlags,
  };

  private _pl?: PlClient;

  /**
   * Low-level: get an authenticated PlClient without resolving a project list.
   * Use this for commands that navigate to multiple users (e.g. admin copy-project).
   */
  protected async connectClient(flags: {
    address: string;
    user?: string;
    password?: string;
    "admin-user"?: string;
    "admin-password"?: string;
  }): Promise<PlClient> {
    if (this._pl) throw new Error("connectClient() called twice");

    if (flags["admin-user"] && flags["admin-password"]) {
      this._pl = await createAdminPlConnection({
        address: flags.address,
        adminUser: flags["admin-user"],
        adminPassword: flags["admin-password"],
      });
    } else {
      this._pl = await createPlConnection({
        address: flags.address,
        user: flags.user,
        password: flags.password,
      });
    }

    return this._pl;
  }

  /**
   * Connect and resolve the project list for a single user.
   * In admin mode (--admin-user + --admin-password + --target-user), operates on the target user's data.
   * In user mode, operates on the authenticated user's own data.
   */
  protected async connect(flags: {
    address: string;
    user?: string;
    password?: string;
    "admin-user"?: string;
    "admin-password"?: string;
    "target-user"?: string;
  }): Promise<{ pl: PlClient; projectListRid: ResourceId }> {
    const hasAdminUser = !!flags["admin-user"];
    const hasAdminPassword = !!flags["admin-password"];
    const hasTarget = !!flags["target-user"];

    // Validate flag combinations
    if (hasTarget && !(hasAdminUser && hasAdminPassword)) {
      throw new Error("--target-user requires --admin-user and --admin-password");
    }
    if ((hasAdminUser || hasAdminPassword) && !hasTarget) {
      throw new Error("--admin-user/--admin-password require --target-user for project commands");
    }

    const pl = await this.connectClient(flags);

    let projectListRid: ResourceId;
    if (hasTarget) {
      const nav = await navigateToUserRoot(pl, flags["target-user"]!);
      projectListRid = nav.projectListRid;
    } else {
      projectListRid = await getProjectListRid(pl);
    }

    return { pl, projectListRid };
  }

  protected async finally(_: Error | undefined): Promise<void> {
    if (this._pl) {
      await this._pl.close();
    }
  }
}
