import {
  Annotation,
  type AxisSpec,
  type PColumnSpec,
  type PObjectSpec,
} from "@milaboratories/pl-model-common";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as internal from "../internal";
import type { AccessorHandle } from "../render/internal";
import {
  collectDatasetAxes,
  findPeerLinks,
  getResultPoolDatasetAxes,
  peerLinkedLast,
} from "./peer_links";

type RenderCtx = ReturnType<typeof internal.getCfgRenderCtx>;

/** A render ctx whose result pool is one upstream block exporting `exports` (name → spec). */
function installPool(exports: Record<string, PObjectSpec>): void {
  const tree: Record<string, { type: string; data?: unknown; fields?: Record<string, string> }> = {
    pframe: {
      type: "PFrame",
      fields: Object.fromEntries(
        Object.keys(exports).map((name) => [`${name}.spec`, `${name}:spec`]),
      ),
    },
    ...Object.fromEntries(
      Object.entries(exports).map(([name, spec]) => [
        `${name}:spec`,
        { type: "json/object", data: spec },
      ]),
    ),
  };
  const get = (handle: AccessorHandle) => tree[handle as string];
  const ctx: Partial<RenderCtx> = {
    getUpstreamBlockCtx: () => [{ blockId: "upstream", prodCtx: "pframe" as AccessorHandle }],
    getResourceType: (handle) => ({ name: get(handle).type, version: "1" }),
    getInputsLocked: () => true,
    getIsReadyOrError: () => true,
    getError: () => undefined,
    hasData: (handle) => get(handle).data !== undefined,
    getDataAsString: (handle) => JSON.stringify(get(handle).data),
    listInputFields: (handle) => Object.keys(get(handle).fields ?? {}),
    resolveWithCommon: (handle, _common, ...steps) => {
      const step = steps[0];
      const field = typeof step === "string" ? step : step.field;
      return get(handle).fields?.[field] as AccessorHandle | undefined;
    },
  };
  vi.spyOn(internal, "getCfgRenderCtx").mockReturnValue(ctx as RenderCtx);
}

afterEach(() => {
  vi.restoreAllMocks();
});

const sample: AxisSpec = { type: "String", name: "pl7.app/sampleId" };
const bulk: AxisSpec = { type: "String", name: "pl7.app/vdj/clonotypeKey", domain: { run: "b" } };
const sc: AxisSpec = { type: "String", name: "pl7.app/vdj/scClonotypeKey", domain: { run: "s" } };
const cluster: AxisSpec = { type: "String", name: "pl7.app/clusterId" };

function column(axesSpec: AxisSpec[], annotations: Record<string, string> = {}): PColumnSpec {
  return { kind: "PColumn", name: "c", valueType: "Int", axesSpec, annotations };
}

const datasets = [
  column([sample, bulk], { [Annotation.IsAnchor]: "true" }),
  column([sample, sc], { [Annotation.IsAnchor]: "true" }),
  column([sample, cluster]),
];

describe("peer links", () => {
  const axes = collectDatasetAxes(datasets);

  test("dataset axes are the main axes of isAnchor columns", () => {
    expect(axes.size).toBe(2);
  });

  test("a linker between two datasets is a peer link", () => {
    const link = column([sc, bulk], { [Annotation.LinkLabel]: "VDJ Integration" });
    expect(findPeerLinks([link], axes)).toEqual(["VDJ Integration"]);
  });

  test("a cluster linker is not", () => {
    const link = column([bulk, cluster], { [Annotation.LinkLabel]: "Clusters" });
    expect(findPeerLinks([link], axes)).toEqual([]);
  });

  test("a mixed path names only its peer link, once", () => {
    const peer = column([sc, bulk], { [Annotation.LinkLabel]: "VDJ Integration" });
    const back = column([bulk, sc], { [Annotation.LinkLabel]: "VDJ Integration" });
    const clusters = column([bulk, cluster], { [Annotation.LinkLabel]: "Clusters" });
    expect(findPeerLinks([peer, clusters, back], axes)).toEqual(["VDJ Integration"]);
  });

  test("a domain mismatch is not a dataset axis", () => {
    const other: AxisSpec = { ...bulk, domain: { run: "x" } };
    const link = column([sc, other], { [Annotation.LinkLabel]: "VDJ Integration" });
    expect(findPeerLinks([link], axes)).toEqual([]);
  });

  test("peer-linked items go last, each group keeps its order", () => {
    expect(peerLinkedLast(["a", "B", "c", "D"], (s) => s === s.toUpperCase())).toEqual([
      "a",
      "c",
      "B",
      "D",
    ]);
  });
});

describe("result pool dataset axes", () => {
  test("a file export in the pool is skipped", () => {
    installPool({
      clonotypes: datasets[0],
      library: { kind: "File", name: "pl7.app/vdj/library" },
    });
    expect(getResultPoolDatasetAxes()).toEqual(collectDatasetAxes([datasets[0]]));
  });
});
