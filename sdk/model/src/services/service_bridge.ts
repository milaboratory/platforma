/**
 * Runtime service bridge — builds lazy service objects from dispatch + registry.
 * Used by the UI layer to provide typed service access.
 */

import type {
  ServiceTypesLike,
  InferServiceUi,
  ServiceName,
  ServiceDispatch,
  UiServices as AllUiServices,
} from "@milaboratories/pl-model-common";
import { UiServiceRegistry } from "@milaboratories/pl-model-common";

// Makes a remote node service appear local.
// Given a service ID, returns an object implementing the service's UI interface.
// Provided by the desktop app (e.g. backed by Electron IPC).
export type ServiceProxy = <S extends ServiceTypesLike>(
  serviceId: ServiceName<S>,
) => InferServiceUi<S>;

/**
 * Builds a lazy services object from ServiceDispatch and UiServiceRegistry.
 * Each service is instantiated on first access. Errors are cached to prevent
 * repeated factory calls on failure.
 */
export function buildServices<S extends Partial<AllUiServices> = Partial<AllUiServices>>(
  dispatch: ServiceDispatch,
  registry: UiServiceRegistry,
): S {
  return Object.create(
    null,
    Object.fromEntries(
      dispatch.getServiceNames().map((id) => {
        let fetched = false;
        let cached: unknown;
        return [
          id,
          {
            enumerable: true,
            get() {
              if (!fetched) {
                fetched = true;
                cached = registry.get(id);
              }
              return cached;
            },
          },
        ];
      }),
    ),
  );
}

/**
 * Builds a ServiceProxy from a ServiceDispatch.
 * Each service method call is forwarded to dispatch.callServiceMethod.
 */
export function createServiceProxy(dispatch: ServiceDispatch): ServiceProxy {
  return ((serviceId: ServiceName) =>
    Object.freeze(
      Object.fromEntries(
        dispatch
          .getServiceMethods(serviceId)
          .map((method) => [
            method,
            (...args: unknown[]) => dispatch.callServiceMethod(serviceId, method, ...args),
          ]),
      ),
    )) as ServiceProxy;
}
