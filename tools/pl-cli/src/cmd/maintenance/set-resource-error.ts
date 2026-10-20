import { Command, Option } from "commander";
import { isNotNullSignedResourceId, resourceIdToString } from "@milaboratories/pl-client";
import { connectClient } from "../../base_command";
import { addOptions, AddressOptions, AdminAuthOptions } from "../../cmd-opts";
import { outputText } from "../../output";
import { parseResourceId } from "../../resource_id";

const DefaultErrorMessage =
  "Manual error set by administrator to trigger blocks re-run. " +
  "Run block once again to get rid of it.";

export default function maintenanceSetResourceErrorCommand(): Command {
  const cmd = new Command("set-resource-error").description(
    "Put an error on one or more resources in a single transaction. " +
      "Resources that already have an error are skipped. " +
      "Requires admin/controller credentials.",
  );

  cmd.argument(
    "<resource-id...>",
    "Resource IDs: as printed by the server (NG:0x1A2B), as decimal numbers, " +
      "or as signed IDs (<decimal ID>|<signature hex>)",
  );
  addOptions(cmd, AddressOptions(), AdminAuthOptions());
  cmd.addOption(
    new Option("-m, --error-message <message>", "Error message to put on the resources").default(
      DefaultErrorMessage,
    ),
  );
  cmd.option(
    "--skip-missing",
    "Skip resources that do not exist instead of failing the whole transaction",
    false,
  );

  cmd.action(async (rawIds: string[], flags) => {
    // Parse all IDs before the connection, so that a typo does not leave a half-done job.
    const ids = rawIds.map(parseResourceId);

    const pl = await connectClient(flags);
    try {
      const result = await pl.withWriteTx("setResourceError", async (tx) => {
        const found = await Promise.all(
          ids.map(async (id) => ({
            id,
            data: flags.skipMissing
              ? await tx.getResourceDataIfExists(id, true)
              : await tx.getResourceData(id, true, true),
          })),
        );

        const missing = found.filter((r) => r.data === undefined).map((r) => r.id);
        const resources = found.flatMap((r) => (r.data === undefined ? [] : [r.data]));
        const targets = resources.filter((r) => !isNotNullSignedResourceId(r.error));
        const skipped = resources.filter((r) => isNotNullSignedResourceId(r.error));

        if (targets.length > 0) {
          // One error resource for all targets: the backend links it to each target separately.
          const error = tx.createError(flags.errorMessage);
          for (const r of targets) tx.setResourceError(r.id, error);
          await tx.commit();
        }

        return { targets, skipped, missing };
      });

      for (const id of result.missing)
        outputText(`skipped ${resourceIdToString(id)}: resource does not exist`);
      for (const r of result.skipped)
        outputText(`skipped ${resourceIdToString(r.id)}: resource already has an error`);
      for (const r of result.targets) outputText(`error set ${resourceIdToString(r.id)}`);
    } finally {
      await pl.close();
    }
  });

  return cmd;
}
