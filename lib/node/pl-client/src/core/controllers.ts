import { ControllerSettings } from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/resource_types";
import type { PlTransaction } from "./transaction";
import {
  anyResourceIdToBigint,
  isNotNullSignedResourceId,
  resourceIdToString,
  resourceType,
  type ResourceData,
  type ResourceType,
  type SignedResourceId,
} from "./types";

/** Resource type of a registered controller: a root resource named `sys/controller/<controller type>`. */
export const ControllerResourceType: ResourceType = resourceType("system/controller", "1");

/** Resource type of the value resource that holds the settings of a controller. */
const ControllerSettingsResourceType: ResourceType = resourceType(
  "system/controller-settings",
  "1",
);

/** The field of a controller resource that holds its settings (the controller type). */
const ControllerSettingsField = "settings";

/** A controller that is registered in the backend. */
export type RegisteredController = {
  /** ID of the controller resource (the controller ID). */
  readonly id: SignedResourceId;
  /** Controller type, as the controller registers it (for example "File/Manager"). */
  readonly type: string;
};

/**
 * Lists the controllers registered in the backend, in ascending order of controller ID.
 * Requires admin or controller credentials.
 */
export async function listRegisteredControllers(
  tx: PlTransaction,
): Promise<RegisteredController[]> {
  const [controllers, settingsTypes] = await Promise.all([
    tx.listResourcesByType(ControllerResourceType, { loadFields: true }),
    listControllerSettingsTypes(tx),
  ]);
  return controllers.map((c) => toRegisteredController(c, settingsTypes));
}

/**
 * Maps the ID of each controller settings resource to the controller type in it.
 * A list request does not go through the resource cache, which knows no finality rule for
 * controller settings.
 */
async function listControllerSettingsTypes(tx: PlTransaction): Promise<Map<bigint, string>> {
  const settings = await tx.listResourcesByType(ControllerSettingsResourceType);
  return new Map(
    settings.map((s) => [
      anyResourceIdToBigint(s.id),
      ControllerSettings.fromBinary(s.data ?? new Uint8Array()).type,
    ]),
  );
}

function toRegisteredController(
  controller: ResourceData,
  settingsTypes: Map<bigint, string>,
): RegisteredController {
  if (
    controller.type.name !== ControllerResourceType.name ||
    controller.type.version !== ControllerResourceType.version
  ) {
    throw new Error(
      `resource ${resourceIdToString(controller.id)} is not a controller: its type is ` +
        `${controller.type.name}:${controller.type.version}`,
    );
  }

  const settingsField = controller.fields.find((f) => f.name === ControllerSettingsField);
  const type =
    settingsField !== undefined && isNotNullSignedResourceId(settingsField.value)
      ? settingsTypes.get(anyResourceIdToBigint(settingsField.value))
      : undefined;
  if (type === undefined)
    throw new Error(`controller resource ${resourceIdToString(controller.id)} has no settings`);

  return { id: controller.id, type };
}
