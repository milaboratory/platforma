import { Command, Flags } from "@oclif/core";
import type { PlClient } from "@milaboratories/pl-client";
import { createAdminPlConnection } from "./admin_connection";

/** Base command for admin operations using controller credentials. */
export abstract class AdminCommand extends Command {
  static baseFlags = {
    address: Flags.string({
      char: "a",
      summary: "Platforma server address",
      helpValue: "<url>",
      env: "PL_ADDRESS",
      required: true,
    }),
    "admin-user": Flags.string({
      summary: "Admin/controller username",
      env: "PL_ADMIN_USER",
      required: true,
    }),
    "admin-password": Flags.string({
      summary: "Admin/controller password",
      env: "PL_ADMIN_PASSWORD",
      required: true,
    }),
    format: Flags.string({
      char: "f",
      summary: "Output format",
      options: ["text", "json"],
      default: "text",
    }),
  };

  private _pl?: PlClient;

  protected async connectAdmin(flags: {
    address: string;
    "admin-user": string;
    "admin-password": string;
  }): Promise<PlClient> {
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
