import { Command } from "@oclif/core";
import type { PlClient } from "@milaboratories/pl-client";
import { createAdminPlConnection } from "./connection";
import { GlobalFlags, AdminAuthFlags } from "./cmd-opts";

/** Base command for admin operations using controller credentials. */
export abstract class AdminCommand extends Command {
  static baseFlags = {
    ...GlobalFlags,
    ...AdminAuthFlags,
  };

  private _pl?: PlClient;

  protected async connectAdmin(flags: {
    address: string;
    "admin-user": string;
    "admin-password": string;
  }): Promise<PlClient> {
    if (this._pl) throw new Error("connectAdmin() called twice");
    this._pl = await createAdminPlConnection({
      address: flags.address,
      adminUser: flags["admin-user"],
      adminPassword: flags["admin-password"],
    });
    return this._pl;
  }

  protected async finally(_: Error | undefined): Promise<void> {
    if (this._pl) {
      await this._pl.close();
    }
  }
}
