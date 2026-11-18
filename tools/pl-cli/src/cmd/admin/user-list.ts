import { isPermissionDenied } from "@milaboratories/pl-client";
import { Command } from "commander";
import { connectClient } from "../../base_command";
import { addOptions, GlobalOptions, AdminAuthOptions } from "../../cmd-opts";
import { outputJson, outputText, outputCsv } from "../../output";

export default function adminUserListCommand(): Command {
  const cmd = new Command("user-list").description(
    "List all known users' logins from a live server. Requires admin/controller credentials.",
  );

  addOptions(cmd, GlobalOptions("csv", ["text", "json", "csv"]), AdminAuthOptions());

  cmd.action(async (flags) => {
    const pl = await connectClient(flags);
    try {
      let users;
      try {
        users = await pl.listUsers();
      } catch (err) {
        if (isPermissionDenied(err))
          throw new Error(
            "The server does not let this user list users. " +
              "Check the server option '--show-user-list-to' and the role of the user.",
            { cause: err },
          );
        throw err;
      }
      const logins = users.map((u) => u.login).sort();
      if (flags.format === "json") outputJson(logins);
      else if (flags.format === "text") outputText(logins.join("\n"));
      else
        outputCsv(
          ["login"],
          logins.map((l) => [l]),
        );
    } finally {
      await pl.close();
    }
  });

  return cmd;
}
