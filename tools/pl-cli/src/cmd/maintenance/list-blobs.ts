import { once } from "node:events";
import { Command, InvalidArgumentError, Option } from "commander";
import {
  isNotNullSignedResourceId,
  resourceIdToString,
  resourceType,
  type ResourceData,
} from "@milaboratories/pl-client";
import { connectClient } from "../../base_command";
import { addOptions, AddressOptions, AdminAuthOptions } from "../../cmd-opts";

// Keep in sync with controllers/shared/resources/blob_storage_v1.go in the backend.
const StorageBlobTypePrefix = "Blob/";
const StorageBlobTypeVersion = "1";
const StorageBlobMetadataBlobInfo = "ctl/file/blobInfo";

export default function maintenanceListBlobsCommand(): Command {
  const cmd = new Command("list-blobs").description(
    "List all blobs of one storage as JSON lines: one blob per line, with its hash and " +
      "the location of its file inside the storage. Requires admin/controller credentials.",
  );

  addOptions(cmd, AddressOptions(), AdminAuthOptions());
  cmd.addOption(
    new Option("--storage <id>", "ID of the storage to list blobs for (e.g. 'work')")
      .env("PL_STORAGE")
      .makeOptionMandatory(),
  );
  cmd.addOption(
    new Option("--page-size <n>", "Number of blobs to read in one transaction")
      .argParser(parsePositiveInt)
      .default(1000),
  );

  cmd.action(async (flags) => {
    const type = resourceType(StorageBlobTypePrefix + flags.storage, StorageBlobTypeVersion);

    const pl = await connectClient(flags);
    try {
      let after: ResourceData["id"] | undefined;
      for (;;) {
        const page = await pl.withReadTx("listBlobs", async (tx) => {
          // Fields are loaded to see the resource error.
          const blobs = await tx.listResourcesByType(type, {
            limit: flags.pageSize,
            after,
            loadFields: true,
          });
          return await Promise.all(
            blobs.map(async (blob) => ({
              blob,
              // Location of the blob file inside the storage: {"path": ..., "sizeBytes": ..., ...}
              blobInfo: await tx.getKValueJsonIfExists<Record<string, unknown>>(
                blob.id,
                StorageBlobMetadataBlobInfo,
              ),
            })),
          );
        });

        for (const { blob, blobInfo } of page) {
          const line =
            JSON.stringify({
              id: resourceIdToString(blob.id),
              type: `${blob.type.name}:${blob.type.version}`,
              ...parseData(blob),
              ...blobInfo,
              error: isNotNullSignedResourceId(blob.error) ? resourceIdToString(blob.error) : null,
            }) + "\n";
          // Wait for a slow reader: else the output of all pages collects in memory.
          if (!process.stdout.write(line)) await once(process.stdout, "drain");
        }

        if (page.length < flags.pageSize) break;
        after = page[page.length - 1].blob.id;
      }
    } finally {
      await pl.close();
    }
  });

  return cmd;
}

/** Blob resource data is a JSON object with the blob hash: {"hashOrigin": ..., "hashValue": ...}. */
function parseData(blob: ResourceData): Record<string, unknown> {
  if (blob.data === undefined || blob.data.length === 0) return {};
  const text = Buffer.from(blob.data).toString();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { data: text };
  }
}

function parsePositiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0)
    throw new InvalidArgumentError(`not a positive integer: ${value}`);
  return n;
}
