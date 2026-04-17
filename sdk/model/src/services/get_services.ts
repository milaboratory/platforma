import { ModelServices, ServiceName } from "@milaboratories/pl-model-common";
import { getCfgRenderCtx } from "../internal";
import { ValueOf } from "@milaboratories/helpers";
import { createServiceProxy } from "./service_bridge";

let cachedServices = new Map<keyof ModelServices, ValueOf<ModelServices>>();

export function getService<Service extends keyof ModelServices>(
  name: Service,
): ModelServices[Service] {
  if (!cachedServices.has(name)) {
    const id = name as ServiceName;
    const ctx = getCfgRenderCtx();
    cachedServices.set(name, createServiceProxy(ctx)(id) as ModelServices[Service]);
  }

  return cachedServices.get(name) as ModelServices[Service];
}
