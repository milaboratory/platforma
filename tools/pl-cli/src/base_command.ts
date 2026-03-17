import { Command } from "@oclif/core";
import type { PlClient } from "@milaboratories/pl-client";
import { createPlConnection } from "./connection";
import { GlobalFlags, UserAuthFlags } from "./cmd-opts";

/** Base command with shared connection and output flags. */
export abstract class PlCommand extends Command {
  static baseFlags = {
    ...GlobalFlags,
    ...UserAuthFlags,
  };

  private _pl?: PlClient;

  protected async connect(flags: {
    address: string;
    user?: string;
    password?: string;
  }): Promise<PlClient> {
    if (this._pl) throw new Error("connect() called twice");
    this._pl = await createPlConnection({
      address: flags.address,
      user: flags.user,
      password: flags.password,
    });
    return this._pl;
  }

  protected async finally(_: Error | undefined): Promise<void> {
    if (this._pl) {
      await this._pl.close();
    }
  }
}
