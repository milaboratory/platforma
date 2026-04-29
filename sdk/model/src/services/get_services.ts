import { ModelServices, ServiceName } from "@milaboratories/pl-model-common";
import { getCfgRenderCtx } from "../internal";
import { ValueOf } from "@milaboratories/helpers";
import { createServiceProxy } from "./service_bridge";
import { GlobalCfgRenderCtx } from "../render/internal";

const cachedServices = new WeakMap<
  GlobalCfgRenderCtx,
  Map<keyof ModelServices, ValueOf<ModelServices>>
>();

export function getService<T extends keyof ModelServices>(name: T): ModelServices[T] {
  const ctx = getCfgRenderCtx();

  const map = cachedServices.has(ctx)
    ? cachedServices.get(ctx)!
    : (() => {
        cachedServices.set(ctx, new Map());
        return cachedServices.get(ctx)!;
      })();

  return map.has(name)
    ? (map.get(name) as ModelServices[T])
    : (() => {
        map.set(name, createServiceProxy(ctx)(name as ServiceName) as ModelServices[T]);
        return map.get(name) as ModelServices[T];
      })();
}
