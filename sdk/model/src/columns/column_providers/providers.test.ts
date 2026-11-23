import type { PObjectSpec } from "@milaboratories/pl-model-common";
import { ResourceTypeName } from "@milaboratories/pl-model-common";
import { afterEach, expect, test } from "vitest";
import type { AccessorHandle } from "../../render/internal";
import { TreeNodeAccessor } from "../../render/accessor";
import { AccessorColumnsProviderImpl } from "./providers";

const rootHandle = "pframe" as AccessorHandle;

function installPFrameCtx(specs: Record<string, PObjectSpec>): void {
  const fieldOf = (step: string | { field: string }) =>
    typeof step === "string" ? step : step.field;
  const specOf = (handle: AccessorHandle) => specs[handle.slice(`${rootHandle}/`.length)];
  (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = {
    resolveWithCommon: (
      handle: AccessorHandle,
      _options: unknown,
      step: string | { field: string },
    ) => {
      const name = fieldOf(step).slice(0, -".spec".length);
      if (handle !== rootHandle || specs[name] === undefined) {
        return undefined;
      }
      return `${rootHandle}/${name}` as AccessorHandle;
    },
    getResourceType: () => ({ name: ResourceTypeName.PFrame, version: "1" }),
    getInputsLocked: () => true,
    listInputFields: () => Object.keys(specs).map((name) => `${name}.spec`),
    hasData: () => true,
    getDataAsString: (handle: AccessorHandle) => JSON.stringify(specOf(handle)),
  };
}

afterEach(() => {
  delete (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx;
});

test("getColumns skips an export that is not a column", () => {
  installPFrameCtx({
    clones: { kind: "PColumn", name: "clones", valueType: "Int", axesSpec: [] },
    library: { kind: "File", name: "library" },
  });
  const provider = new AccessorColumnsProviderImpl(new TreeNodeAccessor(rootHandle, ["main"]));
  expect(provider.getColumns().map((column) => column.getSpec().name)).toEqual(["clones"]);
});
