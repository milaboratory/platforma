import { Command, Option } from "commander";
import {
  anyResourceIdToBigint,
  listRegisteredControllers,
  resourceIdToString,
  type PlTransaction,
  type RegisteredController,
  type SignedResourceId,
} from "@milaboratories/pl-client";
import { connectClient } from "../../../base_command";
import { addOptions, AddressOptions, AdminAuthOptions } from "../../../cmd-opts";
import { outputText } from "../../../output";
import { parseResourceId } from "../../../resource_id";
import { readFixupLevel, resetFixupLevel } from "./fixup_level";

function collect<T>(parse: (raw: string) => T) {
  return (raw: string, previous: T[] | undefined): T[] => [...(previous ?? []), parse(raw)];
}

export default function maintenanceControllerRerunFixupsCommand(): Command {
  const cmd = new Command("rerun-fixups").description(
    "Set the resources fixup level of the selected controllers to 0 in a single transaction. " +
      "On its next start, each controller applies all its one-time resources fixups again. " +
      "Use this after a rollback to a backend version without resources fixups. " +
      "Select controllers with --controller-name and --controller-id " +
      "(see 'maintenance controller list'). Requires admin/controller credentials.",
  );

  addOptions(cmd, AddressOptions(), AdminAuthOptions());
  cmd.addOption(
    new Option(
      "--controller-name <type>",
      'Controller type, as the controller registers it (for example "File/Manager"). ' +
        "Repeat the option to select more controllers",
    ).argParser(collect((raw) => raw)),
  );
  cmd.addOption(
    new Option(
      "--controller-id <resource-id>",
      "Controller ID, as 'maintenance controller list' prints it. " +
        "Repeat the option to select more controllers",
    ).argParser(collect(parseResourceId)),
  );

  cmd.action(async (flags) => {
    const names: string[] = flags.controllerName ?? [];
    const ids: SignedResourceId[] = flags.controllerId ?? [];
    if (names.length === 0 && ids.length === 0)
      throw new Error("select at least one controller with --controller-name or --controller-id");

    const pl = await connectClient(flags);
    try {
      const reset = await pl.withWriteTx("rerunControllerFixups", async (tx) => {
        const selected = await selectControllers(tx, names, ids);
        const levels = await Promise.all(
          selected.map(async (c) => ({ controller: c, level: await readFixupLevel(tx, c.type) })),
        );

        for (const c of selected) resetFixupLevel(tx, c.type);
        await tx.commit();

        return levels;
      });

      for (const { controller, level } of reset)
        outputText(
          `${controller.type} (${resourceIdToString(controller.id)}): ` +
            `resources fixup level ${level} -> 0`,
        );
      outputText("Restart the backend to apply the resources fixups.");
    } finally {
      await pl.close();
    }
  });

  return cmd;
}

/** Resolves the selected controllers. Throws when a name or an ID matches no registered controller. */
async function selectControllers(
  tx: PlTransaction,
  names: string[],
  ids: SignedResourceId[],
): Promise<RegisteredController[]> {
  const registered = await listRegisteredControllers(tx);
  const byType = new Map<string, RegisteredController>();

  for (const name of names) {
    const controller = registered.find((c) => c.type === name);
    if (controller === undefined) throw new Error(`controller "${name}" is not registered`);
    byType.set(controller.type, controller);
  }

  for (const id of ids) {
    const wanted = anyResourceIdToBigint(id);
    const controller = registered.find((c) => anyResourceIdToBigint(c.id) === wanted);
    if (controller === undefined)
      throw new Error(`no registered controller has ID ${resourceIdToString(id)}`);
    byType.set(controller.type, controller);
  }

  return [...byType.values()];
}
