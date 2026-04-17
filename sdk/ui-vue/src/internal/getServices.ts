import {
  BlockDefaultUiServices,
  buildServices,
  createNodeServiceProxy,
  getRawPlatformaInstance,
  PlatformaV3,
  UiServices,
} from "@platforma-sdk/model";
import { createUiServiceRegistry } from "./service_factories";
import { isNil } from "es-toolkit";
import { logError } from "./utils";

let cachedServices: null | Partial<UiServices> = null;

export function getServices<
  Services extends Partial<UiServices> = BlockDefaultUiServices,
>(): Services {
  if (!isNil(cachedServices)) {
    return cachedServices as Services;
  }

  const platforma = getRawPlatformaInstance() as PlatformaV3<any, any, any, any, any, Services>;
  const proxy = createNodeServiceProxy(platforma.serviceDispatch);
  const uiRegistry = createUiServiceRegistry({ proxy });
  const services = buildServices<Services>(platforma.serviceDispatch, uiRegistry);

  window.addEventListener("beforeunload", () => {
    uiRegistry.dispose().catch((err) => {
      logError("uiRegistry error in dispose", err);
    });
  });

  return (cachedServices = services) as Services;
}
