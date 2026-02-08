// @DEPRECATED - use sdk/model/src/filters + sdk/model/src/annotations
import type { SUniversalPColumnId } from "@milaboratories/pl-model-common";
import type { FilterSpecUi } from "../../annotations";
import type { FilterSpec, FilterSpecLeaf } from "../../filters";
import type {
  AnnotationFilter,
  AnnotationMode,
  AnnotationScript,
  IsNA,
  NotFilter,
  NumericalComparisonFilter,
  PatternFilter,
  PatternPredicate,
  ValueRank,
} from "./filter";

export type FilterUi = FilterSpec<
  Extract<
    FilterSpecLeaf,
    // supported filters
    {
      type:
        | "lessThan"
        | "greaterThan"
        | "lessThanOrEqual"
        | "greaterThanOrEqual"
        | "lessThanColumn"
        | "lessThanColumnOrEqual"
        | "patternContainSubsequence"
        | "patternNotContainSubsequence"
        | "patternEquals"
        | "patternNotEquals"
        | "topN"
        | "bottomN"
        | "isNA"
        | "isNotNA";
    }
  >,
  { id: number; name?: string; isExpanded?: boolean }
>;

export type FilterUiType = Exclude<FilterUi, { type: undefined }>["type"];

export type FilterUiOfType<T extends FilterUiType> = Extract<FilterUi, { type: T }>;

// DEPRECATED - use lib/ui/uikit/src/composition/filters
export function unreachable(x: never): never {
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
  throw new Error("Unexpected object: " + x);
}

export type TypeToLiteral<T> = [T] extends [FilterUiType]
  ? "FilterUiType"
  : [T] extends [SUniversalPColumnId]
    ? "SUniversalPColumnId"
    : [T] extends [PatternPredicate]
      ? "PatternPredicate"
      : [T] extends [AnnotationFilter[]]
        ? "AnnotationFilter[]"
        : [T] extends [AnnotationFilter]
          ? "AnnotationFilter"
          : [T] extends [number]
            ? "number"
            : [T] extends [number | undefined]
              ? "number?"
              : [T] extends [string]
                ? "string"
                : [T] extends [string | undefined]
                  ? "string?"
                  : [T] extends [boolean]
                    ? "boolean"
                    : [T] extends [boolean | undefined]
                      ? "boolean?"
                      : [T] extends [unknown[]]
                        ? "unknown[]"
                        : // this is special
                          T extends number
                          ? "number"
                          : T extends string
                            ? "string"
                            : T extends boolean
                              ? "boolean"
                              : T extends Record<string, unknown>
                                ? "form"
                                : "unknown";

// @TODO: "parse" option
export type TypeField<V> = {
  fieldType: TypeToLiteral<V>;
  label: string;
  defaultValue: () => V | undefined;
};

export type TypeFieldRecord<T extends FilterUi> = { [K in keyof T]: TypeField<T[K]> };

export type TypeForm<T> = {
  [P in keyof T]: T[P] extends Record<string, unknown>
    ? {
        fieldType: "form";
        label?: string;
        form?: T[P] extends Record<string, unknown> ? TypeForm<T[P]> : undefined;
        defaultValue: () => T[P];
      }
    : TypeField<T[P]>;
};

export type FormField =
  | {
      fieldType: "form";
      form?: Record<string, FormField>;
      defaultValue: () => Record<string, unknown>;
    }
  | TypeField<FilterUiType>
  | TypeField<string>
  | TypeField<number>
  | TypeField<number | undefined>
  | TypeField<boolean>
  | TypeField<boolean | undefined>
  | TypeField<SUniversalPColumnId>;

export type AnyForm = Record<string, FormField>;

export type AnnotationStepUi = FilterSpecUi<Extract<FilterUi, { type: "and" | "or" }>> & {
  id: number;
};

export type AnnotationScriptUi = {
  isCreated?: boolean;
  title: string;
  mode: AnnotationMode;
  steps: AnnotationStepUi[];
};

export function compileFilter(ui: FilterUi): AnnotationFilter {
  if (ui.type === "or") {
    return {
      type: "or" as const,
      filters: compileFilters(ui.filters),
    };
  }

  if (ui.type === "and") {
    return {
      type: "and" as const,
      filters: compileFilters(ui.filters),
    };
  }

  if (ui.type === "not") {
    return {
      type: "not" as const,
      filter: compileFilter(ui.filter),
    };
  }

  if (ui.type === "isNA") {
    return {
      type: "isNA" as const,
      column: ui.column,
    };
  }

  if (ui.type === "isNotNA") {
    const isNAFilter: IsNA = { type: "isNA", column: ui.column };
    const notFilter: NotFilter = { type: "not", filter: isNAFilter };
    return notFilter;
  }

  if (ui.type === "patternEquals") {
    return {
      type: "pattern" as const,
      column: ui.column,
      predicate: {
        type: "equals" as const,
        value: ui.value,
      },
    };
  }

  if (ui.type === "patternNotEquals") {
    const patternFilter: PatternFilter = {
      type: "pattern",
      column: ui.column,
      predicate: { type: "equals", value: ui.value },
    };
    const notFilter: NotFilter = { type: "not", filter: patternFilter };
    return notFilter;
  }

  if (ui.type === "patternContainSubsequence") {
    return {
      type: "pattern" as const,
      column: ui.column,
      predicate: {
        type: "containSubsequence" as const,
        value: ui.value,
      },
    };
  }

  if (ui.type === "patternNotContainSubsequence") {
    const patternFilter: PatternFilter = {
      type: "pattern",
      column: ui.column,
      predicate: { type: "containSubsequence", value: ui.value },
    };
    const notFilter: NotFilter = { type: "not", filter: patternFilter };
    return notFilter;
  }

  if (ui.type === "topN") {
    const rankTransform: ValueRank = {
      transformer: "rank",
      column: ui.column,
      descending: true,
    };
    const comparisonFilter: NumericalComparisonFilter = {
      type: "numericalComparison",
      lhs: rankTransform,
      rhs: ui.n,
      allowEqual: true,
    };
    return comparisonFilter;
  }

  if (ui.type === "bottomN") {
    const rankTransform: ValueRank = {
      transformer: "rank",
      column: ui.column,
    };
    const comparisonFilter: NumericalComparisonFilter = {
      type: "numericalComparison",
      lhs: rankTransform,
      rhs: ui.n,
      allowEqual: true,
    };
    return comparisonFilter;
  }

  if (ui.type === "lessThan") {
    return {
      type: "numericalComparison" as const,
      lhs: ui.column,
      rhs: ui.x,
    };
  }

  if (ui.type === "greaterThan") {
    return {
      type: "numericalComparison" as const,
      rhs: ui.column,
      lhs: ui.x,
    };
  }

  if (ui.type === "greaterThanOrEqual") {
    return {
      type: "numericalComparison" as const,
      rhs: ui.column,
      lhs: ui.x,
      allowEqual: true,
    };
  }

  if (ui.type === "lessThanOrEqual") {
    return {
      type: "numericalComparison" as const,
      lhs: ui.column,
      rhs: ui.x,
      allowEqual: true,
    };
  }

  if (ui.type === "lessThanColumn") {
    return {
      type: "numericalComparison" as const,
      lhs: ui.column,
      rhs: ui.rhs,
      minDiff: ui.minDiff,
      allowEqual: undefined,
    };
  }

  if (ui.type === "lessThanColumnOrEqual") {
    return {
      type: "numericalComparison" as const,
      lhs: ui.column,
      rhs: ui.rhs,
      minDiff: ui.minDiff,
      allowEqual: true,
    };
  }

  unreachable(ui);
}

export function compileFilters(uiFilters: FilterUi[]): AnnotationFilter[] {
  return uiFilters.filter((f) => f.type !== undefined).map(compileFilter);
}

export function compileAnnotationScript(uiScript: AnnotationScriptUi): AnnotationScript {
  return {
    title: uiScript.title,
    mode: uiScript.mode,
    steps: uiScript.steps
      .filter((step) => {
        // No need to compile empty steps
        if (step.filter.type == null) {
          return false;
        }

        if (step.filter.type === "or") {
          return step.filter.filters.length > 0;
        }

        if (step.filter.type === "and") {
          return step.filter.filters.length > 0;
        }

        return false;
      })
      .map((step) => ({
        label: step.label.trim(),
        filter: compileFilter(step.filter),
      })),
  };
}
