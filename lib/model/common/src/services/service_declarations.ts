/**
 * Service declarations — add new services here.
 *
 * Other files that need updating for a new service:
 * - lib/node/pl-middle-layer/src/js_render/service_injectors.ts (VM bridge)
 * - lib/node/pl-middle-layer/src/middle_layer/middle_layer.ts (ModelServiceRegistry factory)
 * - sdk/ui-vue/src/internal/createAppV3.ts (UiServiceRegistry factory)
 * - sdk/model/src/services/block_service_flags.ts (if default-required by all blocks)
 * - platforma-desktop-app/packages/worker/src/uiServiceInjectors.ts (IPC bridge, node services only)
 */

import type { PFrameDriver, PFrameModelDriver } from "../drivers/pframe/driver";
import type { PFrameSpecDriver } from "../drivers/pframe/spec_driver";
import { service } from "./service_types";

export const Services = {
  PFrameSpec: service<PFrameSpecDriver, PFrameSpecDriver>()({ type: "wasm", name: "pframeSpec" }),
  PFrame: service<PFrameModelDriver, PFrameDriver>()({ type: "node", name: "pframe" }),
};
