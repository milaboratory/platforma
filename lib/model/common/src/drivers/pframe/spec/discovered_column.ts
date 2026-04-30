import { Branded, throwError } from "@milaboratories/helpers";
import { PObjectId } from "../../../pool";
import { AxisQualification } from "./selectors";
import { canonicalizeJson } from "../../../json";

export type DiscoveredPColumn = {
  path: PathItem[];
  column: PObjectId;
  columnQualifications: AxisQualification[];
  queriesQualifications: Record<PObjectId, AxisQualification[]>;
};

export type DiscoveredPColumnId = Branded<PObjectId, "DiscoveredPColumnId">; // CanonicalizedJson<DiscoveredPColumn>;

type PathItem = {
  type: "linker";
  column: PObjectId;
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

export function createDiscoveredPColumn(props: {
  column: PObjectId;
  path: PathItem[];
  columnQualifications: AxisQualification[];
  queriesQualifications: Record<PObjectId, AxisQualification[]>;
}): DiscoveredPColumn {
  return JSON.parse(JSON.stringify(props));
}

export function createDiscoveredPColumnId(props: {
  column: PObjectId;
  path: PathItem[];
  columnQualifications: AxisQualification[];
  queriesQualifications: Record<PObjectId, AxisQualification[]>;
}): DiscoveredPColumnId {
  return stringifyDiscoveredPColumnId(createDiscoveredPColumn(props));
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

export function stringifyDiscoveredPColumnId(id: DiscoveredPColumn) {
  return canonicalizeJson<DiscoveredPColumn>(id) as string as DiscoveredPColumnId;
}
