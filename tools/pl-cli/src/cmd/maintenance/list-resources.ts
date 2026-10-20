import { once } from "node:events";
import { Command, InvalidArgumentError, Option } from "commander";
import {
  isNotNullSignedResourceId,
  resourceIdToString,
  resourceType,
  resourceTypeToString,
  type FieldData,
  type KeyValue,
  type OptionalSignedResourceId,
  type ResourceData,
  type ResourceType,
} from "@milaboratories/pl-client";
import { connectClient } from "../../base_command";
import { addOptions, AddressOptions, AdminAuthOptions } from "../../cmd-opts";
import { parseResourceId } from "../../resource_id";

export default function maintenanceListResourcesCommand(): Command {
  const cmd = new Command("list-resources").description(
    "List resources of one type as JSON lines, in ascending order of resource ID. " +
      "Resource data and metadata values are printed as JSON when they are valid JSON, " +
      'as text when they are valid UTF-8, and as {"base64": ...} in other cases. ' +
      "Requires admin/controller credentials.",
  );

  addOptions(cmd, AddressOptions(), AdminAuthOptions());
  cmd.addOption(
    new Option("--type <name:version>", "Resource type to list (e.g. 'Blob/work:1')")
      .argParser(parseResourceTypeArg)
      .makeOptionMandatory(),
  );
  cmd.addOption(
    new Option("--limit <n>", "Maximum number of resources to list. 0 lists all resources")
      .argParser(parseNonNegativeInt)
      .default(0),
  );
  cmd.addOption(
    new Option(
      "--after <resource-id>",
      "List only resources with IDs greater than this ID. " +
        "To get the next page, give the ID of the last resource of the previous page",
    ).argParser(parseResourceId),
  );
  cmd.option(
    "--load-fields",
    "Load the fields and the error of each resource ('fields' and 'error' keys)",
    false,
  );
  cmd.option(
    "--load-metadata",
    "Load the key-value metadata of each resource ('metadata' key)",
    false,
  );

  cmd.action(async (flags) => {
    const pl = await connectClient(flags);
    try {
      const resources = await pl.withReadTx("listResources", async (tx) => {
        const list = await tx.listResourcesByType(flags.type, {
          limit: flags.limit,
          after: flags.after,
          loadFields: flags.loadFields,
        });
        return await Promise.all(
          list.map(async (resource) => ({
            resource,
            metadata: flags.loadMetadata ? await tx.listKeyValues(resource.id) : undefined,
          })),
        );
      });

      for (const { resource, metadata } of resources) {
        const line = JSON.stringify(toJson(resource, flags.loadFields, metadata)) + "\n";
        // Wait for a slow reader: else the output collects in memory a second time.
        if (!process.stdout.write(line)) await once(process.stdout, "drain");
      }
    } finally {
      await pl.close();
    }
  });

  return cmd;
}

function toJson(
  r: ResourceData,
  withFields: boolean,
  metadata: KeyValue[] | undefined,
): Record<string, unknown> {
  return {
    id: resourceIdToString(r.id),
    type: resourceTypeToString(r.type),
    kind: r.kind,
    originalId: optionalIdToString(r.originalResourceId),
    inputsLocked: r.inputsLocked,
    outputsLocked: r.outputsLocked,
    ready: r.resourceReady,
    final: r.final,
    data: r.data === undefined || r.data.length === 0 ? null : decodeBytes(r.data),
    // The backend sends the resource error as a field: without fields it is not known.
    ...(withFields
      ? { error: optionalIdToString(r.error), fields: r.fields.map(fieldToJson) }
      : {}),
    ...(metadata === undefined
      ? {}
      : { metadata: Object.fromEntries(metadata.map((kv) => [kv.key, decodeBytes(kv.value)])) }),
  };
}

function fieldToJson(f: FieldData): Record<string, unknown> {
  return {
    name: f.name,
    type: f.type,
    status: f.status,
    value: optionalIdToString(f.value),
    error: optionalIdToString(f.error),
    valueIsFinal: f.valueIsFinal,
  };
}

function optionalIdToString(id: OptionalSignedResourceId): string | null {
  return isNotNullSignedResourceId(id) ? resourceIdToString(id) : null;
}

/** JSON value when the bytes are valid JSON, text when valid UTF-8, {"base64": ...} otherwise. */
function decodeBytes(bytes: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { base64: Buffer.from(bytes).toString("base64") };
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseResourceTypeArg(value: string): ResourceType {
  const sep = value.lastIndexOf(":");
  if (sep <= 0 || sep === value.length - 1)
    throw new InvalidArgumentError(`expected <name>:<version>, e.g. 'Blob/work:1': ${value}`);
  return resourceType(value.slice(0, sep), value.slice(sep + 1));
}

function parseNonNegativeInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0)
    throw new InvalidArgumentError(`not a non-negative integer: ${value}`);
  return n;
}
