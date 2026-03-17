import { Command, Flags } from "@oclif/core";
import type { PlClient, ResourceId } from "@milaboratories/pl-client";
import { createPlConnection } from "./connection";
import type { OutputFormat } from "./output";

/** Base command with shared connection and output flags. */
export abstract class PlCommand extends Command {
  static baseFlags = {
    address: Flags.string({
      char: "a",
      summary: "Platforma server address",
      helpValue: "<url>",
      env: "PL_ADDRESS",
      required: true,
    }),
    user: Flags.string({
      char: "u",
      summary: "Username for authentication",
      env: "PL_USER",
    }),
    password: Flags.string({
      char: "p",
      summary: "Password for authentication",
      env: "PL_PASSWORD",
    }),
    format: Flags.string({
      char: "f",
      summary: "Output format",
      options: ["text", "json"],
      default: "text",
    }),
  };

  private _pl?: PlClient;

  protected get outputFormat(): OutputFormat {
    return ((this as any).parsedFlags?.format as OutputFormat) ?? "text";
  }

  protected async connect(flags: {
    address: string;
    user?: string;
    password?: string;
  }): Promise<PlClient> {
    this._pl = await createPlConnection({
      address: flags.address,
      user: flags.user,
      password: flags.password,
    });
    return this._pl;
  }

  /** Get the project list ResourceId for the connected user. */
  protected async getProjectListRid(pl: PlClient): Promise<ResourceId> {
    const { isNullResourceId } = await import("@milaboratories/pl-client");
    return await pl.withReadTx("getProjectList", async (tx) => {
      const fieldData = await tx.getField({
        resourceId: tx.clientRoot,
        fieldName: "projects",
      });
      if (isNullResourceId(fieldData.value)) {
        throw new Error("No project list found for this user.");
      }
      return fieldData.value;
    });
  }

  protected async finally(_: Error | undefined): Promise<void> {
    if (this._pl) {
      await this._pl.close();
    }
  }
}
