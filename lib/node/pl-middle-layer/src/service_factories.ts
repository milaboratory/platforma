/**
 * Model service factories — add a factory for each new service here.
 *
 * Each entry maps a Services key to a factory function that creates the
 * model-side driver instance, or null if the service has no model-side driver
 * (e.g. node services whose driver is provided by the desktop app).
 */

import { ModelServiceRegistry, Services } from "@milaboratories/pl-model-common";
import { SpecDriver } from "@milaboratories/pf-spec-driver";

export function createModelServiceRegistry() {
  return new ModelServiceRegistry(Services, {
    PFrameSpec: () => new SpecDriver(),
    PFrame: null,
  });
}
