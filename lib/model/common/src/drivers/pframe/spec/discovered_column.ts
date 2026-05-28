import { type Branded, throwError } from "@milaboratories/helpers";
import { type CanonicalizedJson, canonicalizeJson, parseJsonSafely } from "../../../json";
import { PObjectId } from "../../../pool";
import { AxisQualification } from "./selectors";
import { ColumnUniversalId } from "./ids";

export interface ColumnDiscoveredKey {
  __isDiscovered: true;
  column: ColumnUniversalId;
  path?: PathItem[];
  columnQualifications?: AxisQualification[];
  queriesQualifications?: Record<PObjectId, AxisQualification[]>;
}

export type ColumnDiscoveredId = Branded<
  CanonicalizedJson<ColumnDiscoveredKey>,
  "ColumnDiscoveredId"
>;

type PathItem = {
  type: "linker";
  column: ColumnUniversalId;
};

export function isColumnDiscoveredKey(obj: unknown): obj is ColumnDiscoveredKey {
  return typeof obj === "object" && obj !== null && "__isDiscovered" in obj;
}

export function isColumnDiscoveredId(str: unknown): str is ColumnDiscoveredId {
  if (typeof str !== "string") return false;
  return isColumnDiscoveredKey(parseJsonSafely(str));
}

export function distillColumnDiscoveredKey(props: ColumnDiscoveredKey): ColumnDiscoveredKey {
  return {
    __isDiscovered: true,
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

export function createColumnDiscoveredId(props: {
  column: ColumnUniversalId;
  path?: PathItem[];
  columnQualifications?: AxisQualification[];
  queriesQualifications?: Record<PObjectId, AxisQualification[]>;
}): ColumnDiscoveredId {
  return stringifyColumnDiscoveredId(props);
}

export function createColumnDiscoveredKey(props: {
  column: ColumnUniversalId;
  path?: PathItem[];
  columnQualifications?: AxisQualification[];
  queriesQualifications?: Record<PObjectId, AxisQualification[]>;
}): ColumnDiscoveredKey {
  return distillColumnDiscoveredKey({ __isDiscovered: true, ...props });
}

export function parseColumnDiscoveredId(id: ColumnDiscoveredId): ColumnDiscoveredKey {
  try {
    const parsed = JSON.parse(id);
    return isColumnDiscoveredKey(parsed)
      ? parsed
      : throwError("Parsed object is not a valid DiscoveredPColumn");
  } catch {
    throw new Error(
      "Invalid ColumnDiscoveredId: not a valid JSON or does not conform to DiscoveredPColumn structure",
    );
  }
}

export function stringifyColumnDiscoveredId(
  id: Omit<ColumnDiscoveredKey, "__isDiscovered">,
): ColumnDiscoveredId {
  return canonicalizeJson<ColumnDiscoveredKey>(
    distillColumnDiscoveredKey({ __isDiscovered: true, ...id }),
  ) as ColumnDiscoveredId;
}
