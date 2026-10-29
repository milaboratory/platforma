import {
  Annotation,
  type AxisSpec,
  type PColumnSpec,
  type PObjectSpec,
} from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import { collectDatasetAxes, findPeerLinks, peerLinkedLast } from "./peer_links";

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

  test("objects other than columns are skipped", () => {
    const file: PObjectSpec = { kind: "File", name: "pl7.app/vdj/library" };
    expect(collectDatasetAxes([file, ...datasets]).size).toBe(2);
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
