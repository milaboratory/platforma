import { filterUiMetadata } from "@milaboratories/uikit";
import type {
  AnchoredPColumnId,
  AxisId,
  CanonicalizedJson,
  FilteredPColumnId,
  ValueType,
} from "@platforma-sdk/model";
import {
  getTypeFromPColumnOrAxisSpec,
  isAnchoredPColumnId,
  isAxisId,
  isFilteredPColumn,
  parseJson,
  type AxisSpec,
  type PColumnSpec,
  type SUniversalPColumnId,
} from "@platforma-sdk/model";
import { DEFAULT_FILTER_TYPE, DEFAULT_FILTERS } from "./constants";
import type { NodeFilter } from "./types";
import {
  type CommonFilter,
  type EditableFilter,
  type PlAdvancedFilterColumnId,
  type SupportedFilterTypes,
} from "./types";

export function getNewId() {
  return Date.now();
}

export function createNewGroup(selectedSourceId: string): NodeFilter {
  return {
    id: getNewId(),
    isExpanded: true,
    type: "and",
    filters: [
      {
        id: getNewId(),
        isExpanded: true,
        ...DEFAULT_FILTERS[DEFAULT_FILTER_TYPE],
        column: selectedSourceId as SUniversalPColumnId,
      } as CommonFilter,
    ],
  };
}

export type NormalizedSpecData = {
  valueType: ValueType;
  annotations: PColumnSpec["annotations"];
  domain: PColumnSpec["domain"];
};
export function getNormalizedSpec(spec: PColumnSpec | AxisSpec): NormalizedSpecData {
  return {
    valueType: getTypeFromPColumnOrAxisSpec(spec),
    annotations: spec.annotations,
    domain: spec.domain,
  };
}

export function isNumericValueType(spec?: PColumnSpec | AxisSpec): boolean {
  if (!spec) {
    return false;
  }
  const valueType = getNormalizedSpec(spec).valueType;
  return (
    valueType === "Int" || valueType === "Long" || valueType === "Float" || valueType === "Double"
  );
}

export function isStringValueType(spec?: PColumnSpec | AxisSpec): boolean {
  if (!spec) {
    return false;
  }
  const valueType = getNormalizedSpec(spec).valueType;
  return valueType === "String";
}

export function isNumericFilter(filter: EditableFilter): filter is Extract<
  EditableFilter,
  {
    type:
      | "equal"
      | "notEqual"
      | "lessThan"
      | "lessThanOrEqual"
      | "greaterThan"
      | "greaterThanOrEqual";
  }
> {
  return (
    filter.type === "equal" ||
    filter.type === "notEqual" ||
    filter.type === "lessThan" ||
    filter.type === "lessThanOrEqual" ||
    filter.type === "greaterThan" ||
    filter.type === "greaterThanOrEqual"
  );
}

export function isPositionFilter(
  filter: EditableFilter,
): filter is Extract<EditableFilter, { type: "topN" | "bottomN" }> {
  return filter.type === "topN" || filter.type === "bottomN";
}

export function isStringFilter(filter: EditableFilter): filter is Extract<
  EditableFilter,
  {
    type:
      | "patternEquals"
      | "patternNotEquals"
      | "patternContainSubsequence"
      | "patternNotContainSubsequence"
      | "patternMatchesRegularExpression"
      | "patternFuzzyContainSubsequence";
  }
> {
  return (
    filter.type === "patternEquals" ||
    filter.type === "patternNotEquals" ||
    filter.type === "patternContainSubsequence" ||
    filter.type === "patternNotContainSubsequence" ||
    filter.type === "patternMatchesRegularExpression" ||
    filter.type === "patternFuzzyContainSubsequence"
  );
}

export function getFilterInfo(filterType: SupportedFilterTypes): {
  label: string;
  supportedFor: (spec: NormalizedSpecData) => boolean;
} {
  return filterUiMetadata[filterType as keyof typeof filterUiMetadata];
}

export function isValidColumnId(id: unknown): id is PlAdvancedFilterColumnId {
  if (typeof id !== "string") {
    return false;
  }
  try {
    const parsedId = parseJson<FilteredPColumnId | AnchoredPColumnId | AxisId>(
      id as CanonicalizedJson<FilteredPColumnId | AnchoredPColumnId | AxisId>,
    );
    return isFilteredPColumn(parsedId) || isAnchoredPColumnId(parsedId) || isAxisId(parsedId);
  } catch {
    return false;
  }
}
