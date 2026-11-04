import {
  Annotation,
  canonicalizeAxisId,
  isPColumnSpec,
  readAnnotation,
  type AxisId,
  type CanonicalizedJson,
  type PColumnSpec,
  type PObjectSpec,
} from "@milaboratories/pl-model-common";
import { uniq } from "es-toolkit";
import { ResultPoolColumnsProvider } from "./column_providers";

export type DatasetAxes = Set<CanonicalizedJson<AxisId>>;

/**
 * Main axes of the datasets: the second axis of every column marked `pl7.app/isAnchor`.
 * Non-column objects, such as exported files, have no axes and are skipped.
 */
export function collectDatasetAxes(specs: PObjectSpec[]): DatasetAxes {
  return new Set(
    specs.flatMap((spec) => {
      if (!isPColumnSpec(spec)) return [];
      const main = spec.axesSpec[1];
      return readAnnotation(spec, Annotation.IsAnchor) === "true" && main !== undefined
        ? [canonicalizeAxisId(main)]
        : [];
    }),
  );
}

/** {@link collectDatasetAxes} over the result pool. */
export function getResultPoolDatasetAxes(): DatasetAxes {
  return collectDatasetAxes(
    ResultPoolColumnsProvider()
      .getColumns()
      .map((c) => c.getSpec()),
  );
}

/**
 * Labels of the peer links on a linker path. A peer link joins two datasets' main axes, e.g. one
 * clonotype to another, so the columns behind it describe a different clonotype than the row.
 */
export function findPeerLinks(linkers: PColumnSpec[], datasetAxes: DatasetAxes): string[] {
  return uniq(
    linkers.flatMap((l) => {
      const peer = l.axesSpec.every((a) => datasetAxes.has(canonicalizeAxisId(a)));
      const label = readAnnotation(l, Annotation.LinkLabel) ?? readAnnotation(l, Annotation.Label);
      return peer && label ? [label] : [];
    }),
  );
}

/** Hover text for the link icon. */
export function describePeerLinks(links: string[]): string {
  return `Reached via ${links.join(", then ")}`;
}

/** Moves peer-linked items after the others, keeping the order within each group. */
export function peerLinkedLast<T>(items: T[], isPeerLinked: (item: T) => boolean): T[] {
  return [...items.filter((i) => !isPeerLinked(i)), ...items.filter(isPeerLinked)];
}
