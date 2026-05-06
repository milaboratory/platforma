import { Branded, throwError } from "@milaboratories/helpers";
import { PObjectId } from "../../../pool";
import { AxisQualification } from "./selectors";
import { canonicalizeJson } from "../../../json";

export type DiscoveredPColumn = {
  column: PObjectId;
  path?: PathItem[];
  columnQualifications?: AxisQualification[];
  queriesQualifications?: Record<PObjectId, AxisQualification[]>;
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

export function distillDiscoveredPColumn(props: DiscoveredPColumn): DiscoveredPColumn {
  return {
    column: props.column,
    path: Array.isArray(props.path) && props.path.length > 0 ? props.path : undefined,
    columnQualifications:
      Array.isArray(props.columnQualifications) && props.columnQualifications.length > 0
        ? props.columnQualifications
        : undefined,
    queriesQualifications:
      props.queriesQualifications && Object.keys(props.queriesQualifications).length > 0
        ? props.queriesQualifications
        : undefined,
  };
}

export function createDiscoveredPColumnId(props: {
  column: PObjectId;
  path?: PathItem[];
  columnQualifications?: AxisQualification[];
  queriesQualifications?: Record<PObjectId, AxisQualification[]>;
}): DiscoveredPColumnId {
  return stringifyDiscoveredPColumnId(props);
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
  return canonicalizeJson<DiscoveredPColumn>(
    distillDiscoveredPColumn(id),
  ) as string as DiscoveredPColumnId;
}
