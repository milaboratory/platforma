import type { RenderCtxBase } from "../../../render";
import type { PlDataTableModel } from "../typesV5";
import { createPlDataTableOptionsV2, createPlDataTableV2 } from "./createPlDataTableV2";
import { createPlDataTableV3 } from "./createPlDataTableV3";
import type { createPlDataTableOptionsV3 } from "./createPlDataTableV3";

export function createPlDataTable<A, U>(
  ctx: RenderCtxBase<A, U>,
  options: { version: "v2" } & createPlDataTableOptionsV2,
): ReturnType<typeof createPlDataTableV2>;
export function createPlDataTable<A, U>(
  ctx: RenderCtxBase<A, U>,
  options: { version?: "v3" } & createPlDataTableOptionsV3,
): ReturnType<typeof createPlDataTableV3>;
export function createPlDataTable<A, U>(
  ctx: RenderCtxBase<A, U>,
  options:
    | ({ version: "v2" } & createPlDataTableOptionsV2)
    | ({ version?: "v3" } & createPlDataTableOptionsV3),
): PlDataTableModel | undefined {
  if (options.version === "v2") {
    return createPlDataTableV2(ctx, options.columns, options.tableState, options.options);
  } else {
    // default version is last (v3 at the moment)
    return createPlDataTableV3(ctx, options);
  }
}
