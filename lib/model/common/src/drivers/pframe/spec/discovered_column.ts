import { Branded, throwError } from "@milaboratories/helpers";
import { PObjectId } from "../../../pool";
import { AxisQualification } from "../spec_driver";
import canonicalize from "canonicalize";

export type DiscoveredPColumn = {
  path: PathItem[];
  column: PObjectId;
  columnQualifications: AxisQualification[];
  // queriesAxes???
  queriesQualifications: AxisQualification[][];
};

export type DiscoveredPColumnId = Branded<PObjectId, DiscoveredPColumn>;

type PathItem = {
  column: PObjectId;
  qualifications: AxisQualification[];
};

export function isDiscoveredPColumn(obj: unknown): obj is DiscoveredPColumn {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "path" in obj &&
    "column" in obj &&
    "columnQualifications" in obj &&
    "queriesQualifications" in obj
  );
}

export function createDiscoveredPColumn(
  column: PObjectId,
  path: PathItem[],
  columnQualifications: AxisQualification[],
  queriesQualifications: AxisQualification[][],
): DiscoveredPColumn {
  return {
    column,
    path,
    columnQualifications,
    queriesQualifications,
  };
}

export function createDiscoveredPColumnId(
  column: PObjectId,
  path: PathItem[],
  columnQualifications: AxisQualification[],
  queriesQualifications: AxisQualification[][],
): DiscoveredPColumnId {
  return stringifyDiscoveredPColumnId(
    createDiscoveredPColumn(column, path, columnQualifications, queriesQualifications),
  );
}

export function parseDiscoveredPColumnId(id: DiscoveredPColumnId): DiscoveredPColumn {
  try {
    const parsed = JSON.parse(id);
    return isDiscoveredPColumn(parsed)
      ? parsed
      : throwError("Parsed object is not a valid DiscoveredPColumn");
  } catch {
    throw new Error(
      "Invalid DiscoveredPColumnId: not a valid JSON or does not conform to DiscoveredPColumn structure",
    );
  }
}

export function stringifyDiscoveredPColumnId(id: DiscoveredPColumn): DiscoveredPColumnId {
  return (
    (canonicalize(id) as undefined | DiscoveredPColumnId) ??
    throwError("Failed to stringify DiscoveredPColumnId")
  );
}
