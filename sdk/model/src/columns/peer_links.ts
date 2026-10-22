import {
  Annotation,
  canonicalizeAxisId,
  readAnnotation,
  type AxisId,
  type CanonicalizedJson,
  type PColumnSpec,
} from "@milaboratories/pl-model-common";
import { uniq } from "es-toolkit";
import { ResultPoolColumnsProvider } from "./column_providers";

export type DatasetAxes = Set<CanonicalizedJson<AxisId>>;

/** Main axes of the datasets: the second axis of every column marked `pl7.app/isAnchor`. */
export function collectDatasetAxes(specs: PColumnSpec[]): DatasetAxes {
  return new Set(
    specs.flatMap((spec) => {
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
