/**
 * Service declarations — add new services here.
 *
 * After adding a service, fix type errors in these files:
 *
 * Model side:
 * - lib/node/pl-middle-layer/src/js_render/service_injectors.ts — VM bridge for workflow scripts
 * - lib/node/pl-middle-layer/src/middle_layer/middle_layer.ts — ModelServiceRegistry factory
 *
 * UI side:
 * - lib/model/common/src/services/service_injector_factory.ts — driver method wrappers (node services only)
 * - sdk/ui-vue/src/internal/createAppV3.ts — UiServiceRegistry factory
 *
 * Optional:
 * - sdk/model/src/services/block_service_flags.ts — only if default-required by all blocks
 */

import type { PFrameDriver, PFrameModelDriver } from "../drivers/pframe/driver";
import type { PFrameSpecDriver } from "../drivers/pframe/spec_driver";
import { service } from "./service_types";

export const Services = {
  PFrameSpec: service<PFrameSpecDriver, PFrameSpecDriver>()({ type: "wasm", name: "pframeSpec" }),
  PFrame: service<PFrameModelDriver, PFrameDriver>()({ type: "node", name: "pframe" }),
};
