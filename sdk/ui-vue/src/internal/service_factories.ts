/**
 * UI service factories — add a factory for each new service here.
 *
 * Each entry maps a Services key to a factory function that creates the
 * UI-side driver instance:
 * - WASM services: instantiated directly (e.g. SpecDriver)
 * - Node services: proxied via IPC using NodeServiceProxy
 */

import { Services, UiServiceRegistry } from "@milaboratories/pl-model-common";
import { SpecDriver } from "@milaboratories/pf-spec-driver";
import type { ServiceProxy } from "@platforma-sdk/model";

export type UiServiceOptions = {
  proxy: ServiceProxy;
};

export function createUiServiceRegistry(options: UiServiceOptions) {
  return new UiServiceRegistry(Services, {
    PFrameSpec: () => new SpecDriver(),
    PFrame: () => options.proxy(Services.PFrame),
  });
}
