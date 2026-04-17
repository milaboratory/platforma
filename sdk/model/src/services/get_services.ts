import { ModelServices, ServiceName } from "@milaboratories/pl-model-common";
import { getCfgRenderCtx } from "../internal";
import { ValueOf } from "@milaboratories/helpers";
import { createServiceProxy } from "./service_bridge";

let cachedServices = new Map<keyof ModelServices, ValueOf<ModelServices>>();

export function getService<T extends keyof ModelServices>(name: T): ModelServices[T] {
  if (!cachedServices.has(name)) {
    const id = name as ServiceName;
    const ctx = getCfgRenderCtx();
    cachedServices.set(name, createServiceProxy(ctx)(id) as ModelServices[T]);
  }

  return cachedServices.get(name) as ModelServices[T];
}
