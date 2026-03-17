import { AdminCommand } from "../../admin_base_command";
import { output } from "../../output";

export default class AdminUserList extends AdminCommand {
  static override description =
    "List users on the server. Note: only shows users with root resources (SHA256 hashes).";

  static override flags = {
    ...AdminCommand.baseFlags,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AdminUserList);
    const pl = await this.connectAdmin(flags);

    // The server root contains fields named by SHA256(username).
    // We can enumerate them but cannot reverse the hash to get usernames.
    // This lists root resource fields as user identifiers.
    const users = await pl.withReadTx("listUsers", async (tx) => {
      const rootData = await tx.getResourceData(tx.clientRoot, true);
      return rootData.fields
        .filter((f) => f.name !== "projects" && !f.name.startsWith("alternative_root_"))
        .map((f) => ({
          rootHash: f.name,
          hasData: String(f.value) !== "0",
        }));
    });

    if (flags.format === "json") {
      output(users, "json");
    } else {
      if (users.length === 0) {
        console.log("No user roots found.");
      } else {
        console.log("User root hashes:");
        for (const u of users) {
          console.log(`  ${u.rootHash}`);
        }
        console.log(`\n${users.length} user(s)`);
        console.log(
          "\nNote: Hashes are SHA256 of usernames. To access a specific user, use --source-user with the original username.",
        );
      }
    }
  }
}
