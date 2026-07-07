import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import type { DataInfo, PColumn, PColumnValues } from "@platforma-sdk/model";
import { applySpecOverrides, matchAxis } from "@milaboratories/pl-model-common";
import type {
  AxesSpec,
  AxisPatches,
  SpecOverrides,
  SpecQuery,
} from "@milaboratories/pl-model-common";

type Leaf = PColumn<PlTreeNodeAccessor | PColumnValues | DataInfo<PlTreeNodeAccessor>>;
type Node = SpecQuery<Leaf>;

/**
 * Collapse the client-side `specOverride` query node at the host boundary —
 * pframe-engine never sees it. The override is pushed down through the
 * subtree until it lands on `column`-leaf nodes, where it is folded into
 * the leaf's spec via {@link applySpecOverrides}. Intermediate join nodes
 * are left untouched — pframe-engine will recompute their result spec
 * from the patched leaves.
 *
 * Designed to run as the `node` visitor in `mapPTableDefV2` (post-order),
 * so by the time we see a `specOverride` its inner subtree is already
 * mapped to {@link PColumn} leaves.
 *
 * Currently only `column` and `linkerJoin` are walked. Other node shapes
 * under `specOverride` throw — pframe-engine support for them is still
 * in progress. Extend the switch in {@link pushSpecOverrideDown} as more
 * shapes become needed.
 */
export function collapseSpecOverrideNode(node: Node): Node {
  if (node.type !== "specOverride") return node;
  return pushSpecOverrideDown(node.input, node.override);
}

function pushSpecOverrideDown(node: Node, overrides: SpecOverrides): Node {
  switch (node.type) {
    case "column":
      return {
        type: "column",
        column: { ...node.column, spec: applySpecOverrides(node.column.spec, overrides) },
      };

    case "linkerJoin": {
      // `axesSpec` patches are positional against the linkerJoin's OUTPUT axes,
      // which equal the secondary side's axes (ColumnDiscoveredRecipe emits the
      // hit on the many-side of the linker). Route axesSpec only into secondary;
      // applying the same positional indices to the linker would silently
      // mis-target the linker's own axes.
      //
      // Non-axesSpec patches (domain / contextDomain / annotations) are
      // column-level and not positional — keep the existing both-sides walk.
      const { axesSpec: _axesSpec, ...nonAxesOverrides } = overrides;
      const hasNonAxes =
        nonAxesOverrides.domain !== undefined ||
        nonAxesOverrides.contextDomain !== undefined ||
        nonAxesOverrides.annotations !== undefined;
      return {
        ...node,
        linker: hasNonAxes ? pushSpecOverrideDown(node.linker, nonAxesOverrides) : node.linker,
        secondary: node.secondary.map((e) => ({
          ...e,
          entry: pushSpecOverrideDown(e.entry, overrides),
        })),
      };
    }

    // case "outerJoin":
    //   return {
    //     ...node,
    //     primary: {
    //       ...node.primary,
    //       entry: pushSpecOverrideDown(node.primary.entry, overrides),
    //     },
    //     secondary: node.secondary.map((e) => ({
    //       ...e,
    //       entry: pushSpecOverrideDown(e.entry, overrides),
    //     })),
    //   };

    // case "innerJoin":
    // case "fullJoin":
    // case "symmetricJoin":
    //   return {
    //     ...node,
    //     entries: node.entries.map((e) => ({
    //       ...e,
    //       entry: pushSpecOverrideDown(e.entry, overrides),
    //     })),
    //   };

    case "sliceAxes": {
      // axesSpec patches are positional against the slice OUTPUT axes (the
      // recipe-layer spec the consumer sees), but the inner input still
      // carries the full pre-slice axes list. Translate outer indices to
      // inner indices before pushing the override down.
      //
      // Non-axesSpec overrides (domain / contextDomain / annotations) are
      // column-level and pass through transparently.
      if (overrides.axesSpec === undefined || Object.keys(overrides.axesSpec).length === 0) {
        return { ...node, input: pushSpecOverrideDown(node.input, overrides) };
      }

      const innerAxes = effectiveAxesSpec(node.input);
      if (innerAxes === undefined) {
        throw new Error(
          `specOverride over sliceAxes: cannot translate axesSpec — ` +
            `inner shape unknown for input type "${node.input.type}"`,
        );
      }

      const filteredInnerIdxs = new Set<number>();
      for (const filter of node.axisFilters) {
        const idx = innerAxes.findIndex((a) => matchAxis(filter.axisSelector, a));
        if (idx < 0) {
          throw new Error(
            `specOverride over sliceAxes: filter selector ` +
              `${JSON.stringify(filter.axisSelector)} not found in inner axes`,
          );
        }
        filteredInnerIdxs.add(idx);
      }

      // outer index j (post-slice) ↔ inner index = j-th surviving position.
      const outerToInner: number[] = [];
      for (let i = 0; i < innerAxes.length; i++) {
        if (!filteredInnerIdxs.has(i)) outerToInner.push(i);
      }

      const translated: AxisPatches = {};
      for (const [outerKey, patch] of Object.entries(overrides.axesSpec)) {
        const outerIdx = Number(outerKey);
        const innerIdx = outerToInner[outerIdx];
        if (innerIdx === undefined) {
          throw new Error(
            `specOverride over sliceAxes: outer axesSpec index ${outerIdx} ` +
              `out of range (slice output has ${outerToInner.length} axes)`,
          );
        }
        translated[innerIdx] = patch;
      }

      const translatedOverrides: SpecOverrides = { ...overrides, axesSpec: translated };
      return { ...node, input: pushSpecOverrideDown(node.input, translatedOverrides) };
    }

    // // Transparent transforms — passthrough.
    // case "sort":
    // case "filter":
    // case "transformColumns":
    //   return { ...node, input: pushSpecOverrideDown(node.input, overrides) };

    // // Synthetic leaves — patch the spec carrier they expose, or
    // // throw if the node has no natural place to absorb overrides.
    // case "inlineColumn":
    //   return {
    //     ...node,
    //     column: { ...node.column, spec: applySpecOverrides(node.column.spec, overrides) },
    //   };

    // case "sparseToDenseColumn":
    //   // Same idea: patch the new dense column's spec carrier.
    //   return {
    //     ...node,
    //     newSpec: applySpecOverrides(node.newSpec, overrides),
    //   };

    default:
      throw new Error(
        `specOverride: inner node "${node.type}" is not supported yet — ` +
          "only column / linkerJoin can carry an override " +
          "(pframe-engine support for the rest is in progress)",
      );
  }
}

/**
 * Effective post-traversal {@link AxesSpec} of a {@link Node} — used to
 * translate positional axesSpec patches across structural nodes whose
 * indexing differs from their input (currently only `sliceAxes`).
 *
 * Returns `undefined` when the node shape is not introspectable here.
 * Callers must then refuse axesSpec translation and surface a clear error,
 * rather than silently mis-targeting indices.
 */
function effectiveAxesSpec(node: Node): AxesSpec | undefined {
  switch (node.type) {
    case "column":
      return node.column.spec.axesSpec;

    case "linkerJoin":
      // Output axes equal the secondary side's axes (linker side drops out).
      // All secondary entries share the same axis identity post-join — read
      // the first one.
      return node.secondary.length === 0 ? undefined : effectiveAxesSpec(node.secondary[0].entry);

    case "sliceAxes": {
      const inner = effectiveAxesSpec(node.input);
      if (inner === undefined) return undefined;
      const filtered = new Set<number>();
      for (const f of node.axisFilters) {
        const i = inner.findIndex((a) => matchAxis(f.axisSelector, a));
        if (i >= 0) filtered.add(i);
      }
      return inner.filter((_, i) => !filtered.has(i));
    }

    default:
      return undefined;
  }
}
