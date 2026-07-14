import type { AxisId } from "@milaboratories/pl-model-common";
import { canonicalizeAxisId, getAxisId, PColumnName } from "@milaboratories/pl-model-common";
import type { ColumnsSource } from "./column_providers";
import { ColumnsCollection, isColumnsCollection } from "./columns_collection";
import type { GlobalCfgRenderCtx } from "../render/internal";
import { TreeNodeAccessor } from "../render";
import { isColumnLazy } from "./column_lazy";

const RT_JSON = "PColumnData/Json";
const RT_JSON_PARTITIONED = "PColumnData/JsonPartitioned";

/**
 * Build an `axisValuesLabels` callback by discovering `pl7.app/label` columns
 * from the given source, eagerly materialising their value→label maps, and
 * keying them by canonical axis id.
 *
 * Modern replacement for `ctx.resultPool.findLabels` — uses the new
 * column-access mechanism (filtered {@link ColumnsCollection}) instead of
 * walking the raw result pool.
 *
 * Pair with {@link expandByPartition} (or any consumer expecting the
 * `(axisId) => Record<axisValue, label>` shape).
 *
 * Skips:
 *  - non-leaf recipes (only direct `ColumnLazy` data is read);
 *  - label columns whose `axesSpec.length !== 1`;
 *  - label columns whose data resource type isn't `PColumnData/Json` /
 *    `PColumnData/JsonPartitioned`.
 */
export function deriveAxisValuesLabels(
  source?: ColumnsCollection | (ColumnsCollection | ColumnsSource)[],
  opts?: { ctx?: GlobalCfgRenderCtx },
): (axisId: AxisId) => Record<string | number, string> | undefined {
  const collection =
    source === undefined
      ? ColumnsCollection(undefined, opts)
      : isColumnsCollection(source)
        ? source
        : ColumnsCollection(source, opts);

  const labelCols = collection
    .filter({ include: { name: [{ type: "exact", value: PColumnName.Label }] } })
    .getColumns();

  const byAxis = labelCols.reduce<Map<string, Record<string | number, string>>>((map, col) => {
    if (!isColumnLazy(col)) return map;
    const spec = col.getSpec();
    if (spec.axesSpec.length !== 1) return map;

    const data = col.getData();
    if (!(data instanceof TreeNodeAccessor)) return map;

    const labelMap = readLabelMap(data);
    if (!labelMap) return map;

    map.set(canonicalizeAxisId(getAxisId(spec.axesSpec[0])), labelMap);
    return map;
  }, new Map());

  return (axisId) => byAxis.get(canonicalizeAxisId(axisId));
}

function readLabelMap(acc: TreeNodeAccessor): undefined | Record<string | number, string> {
  const rt = acc.resourceType.name;

  if (rt === RT_JSON) {
    const json = acc.getDataAsJson<{ data?: Record<string, string> }>();
    return json?.data ? parseLabelKeys(json.data) : undefined;
  }

  if (rt === RT_JSON_PARTITIONED) {
    return acc.listInputFields().reduce<Record<string | number, string>>((merged, partKey) => {
      const part = acc.resolve({
        field: partKey,
        assertFieldType: "Input",
        ignoreError: true,
      });
      if (!part) return merged;
      const json = part.getDataAsJson<{ data?: Record<string, string> }>();
      if (!json?.data) return merged;
      return Object.assign(merged, parseLabelKeys(json.data));
    }, {});
  }

  return undefined;
}

function parseLabelKeys(raw: Record<string, string>): Record<string | number, string> {
  return Object.entries(raw).reduce<Record<string | number, string>>((acc, [k, v]) => {
    try {
      const parsed = JSON.parse(k);
      acc[Array.isArray(parsed) ? parsed[0] : parsed] = v;
    } catch {
      acc[k] = v;
    }
    return acc;
  }, {});
}
