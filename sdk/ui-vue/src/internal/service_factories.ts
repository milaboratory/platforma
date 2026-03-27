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
import type { NodeServiceProxy } from "@platforma-sdk/model";

export function createUiServiceRegistry(proxy: NodeServiceProxy) {
  return new UiServiceRegistry(Services, {
    PFrameSpec: () => new SpecDriver(),
    PFrame: () => proxy(Services.PFrame),
  });
}
