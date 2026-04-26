/**
 * Service declarations — add new services here.
 *
 * `modelMethods` / `uiMethods` lists are the single source of truth for
 * method names exposed on each side. They drive SERVICE_METHOD_MAP (UI
 * ServiceProxy forwarders) and MODEL_SERVICE_METHOD_MAP (workflow VM
 * bridge), so node/main/wasm split no longer needs introspection stubs.
 *
 * After adding a service, fix type errors in these files:
 *
 * Model side:
 * - lib/node/pl-middle-layer/src/js_render/service_injectors.ts — VM bridge for workflow scripts
 * - lib/node/pl-middle-layer/src/middle_layer/middle_layer.ts — ModelServiceRegistry factory
 *
 * UI side:
 * - lib/model/common/src/services/node_service_handlers.ts — driver method wrappers (node services only)
 * - sdk/ui-vue/src/internal/createAppV3.ts — UiServiceRegistry factory
 *
 * Electron main side (only for `main` services):
 * - platforma-desktop-app/packages/main/src/services/mainServices.ts — main-process dispatcher
 *
 * Optional:
 * - sdk/model/src/services/block_service_flags.ts — only if default-required by all blocks
 */

import type { DialogService } from "../dialog";
import type { PFrameDriver, PFrameModelDriver } from "../drivers/pframe/driver";
import type { PFrameSpecDriver } from "../drivers/pframe/spec_driver";
import { service } from "./service_types";

export const Services = {
  PFrameSpec: service<PFrameSpecDriver, PFrameSpecDriver>()({
    type: "wasm",
    name: "pframeSpec",
    modelMethods: [
      "createSpecFrame",
      "listColumns",
      "discoverColumns",
      "deleteColumn",
      "evaluateQuery",
      "buildQuery",
      "expandAxes",
      "collapseAxes",
      "findAxis",
      "findTableColumn",
    ] as const,
    uiMethods: [
      "createSpecFrame",
      "listColumns",
      "discoverColumns",
      "deleteColumn",
      "evaluateQuery",
      "buildQuery",
      "expandAxes",
      "collapseAxes",
      "findAxis",
      "findTableColumn",
    ] as const,
  }),
  PFrame: service<PFrameModelDriver, PFrameDriver>()({
    type: "node",
    name: "pframe",
    modelMethods: ["createPFrame", "createPTable", "createPTableV2"] as const,
    uiMethods: [
      "findColumns",
      "getColumnSpec",
      "listColumns",
      "calculateTableData",
      "getUniqueValues",
      "getShape",
      "getSpec",
      "getData",
      "writePTableToFs",
    ] as const,
  }),
  Dialog: service<Record<string, never>, DialogService>()({
    type: "main",
    name: "dialog",
    modelMethods: [] as const,
    uiMethods: ["showSaveDialog"] as const,
  }),
};
