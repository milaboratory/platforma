import { Command, Option } from "commander";
import {
  asSignedResourceId,
  createSignedResourceId,
  isLocalResourceId,
  isNotNullSignedResourceId,
  resourceIdFromString,
  resourceIdToString,
  type SignedResourceId,
} from "@milaboratories/pl-client";
import { connectClient } from "../../base_command";
import { addOptions, AddressOptions, AdminAuthOptions } from "../../cmd-opts";
import { outputText } from "../../output";

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

  cmd.action(async (rawIds: string[], flags) => {
    // Parse all IDs before the connection, so that a typo does not leave a half-done job.
    const ids = rawIds.map(parseResourceId);

    const pl = await connectClient(flags);
    try {
      const result = await pl.withWriteTx("setResourceError", async (tx) => {
        const resources = await Promise.all(ids.map((id) => tx.getResourceData(id, true, true)));

        const targets = resources.filter((r) => !isNotNullSignedResourceId(r.error));
        const skipped = resources.filter((r) => isNotNullSignedResourceId(r.error));

        if (targets.length > 0) {
          // One error resource for all targets: the backend links it to each target separately.
          const error = tx.createError(flags.errorMessage);
          for (const r of targets) tx.setResourceError(r.id, error);
          await tx.commit();
        }

        return { targets, skipped };
      });

      for (const r of result.skipped)
        outputText(`skipped ${resourceIdToString(r.id)}: resource already has an error`);
      for (const r of result.targets) outputText(`error set ${resourceIdToString(r.id)}`);
    } finally {
      await pl.close();
    }
  });

  return cmd;
}

/**
 * Admin and controller roles do not need resource signatures: an ID without a signature
 * is accepted by the backend for these roles.
 */
function parseResourceId(raw: string): SignedResourceId {
  const str = raw.trim();
  if (str.includes("|")) return asSignedResourceId(str);

  let id: bigint | undefined = resourceIdFromString(str);
  if (id === undefined && /^\d+$/.test(str)) id = BigInt(str);
  if (id === undefined || id === 0n || isLocalResourceId(id))
    throw new Error(`not a global resource ID: ${raw}`);

  return createSignedResourceId(id);
}
