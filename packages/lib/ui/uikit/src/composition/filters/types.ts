import type {
  FilterSpec,
  FilterSpecOfType,
  FilterSpecType,
  SimplifiedPColumnSpec,
  SUniversalPColumnId,
} from "@platforma-sdk/model";

/** Metadata about a single field in FilterSpec */
export type FilterSpecTypeField<V> = {
  label: string;
  fieldType: FilterSpecTypeToLiteral<V>;
  defaultValue: () => V | undefined;
};

/** Converts each field in FilterSpec to FilterSpecTypeField */
export type FilterSpecTypeFieldRecord<T extends FilterSpec> = {
  [K in keyof T]: FilterSpecTypeField<T[K]>;
};

/** Extracts FilterSpecOfType from FilterSpecType */
export type FilterSpecFormField<T extends FilterSpec> = {
  [K in keyof T]: FilterSpecTypeField<T[K]>;
};

/** Metadata about all supported filter types */
export type FilterSpecMetadataRecord<T extends FilterSpecType> = {
  [P in T]: {
    label: string;
    labelNot?: string;
    form: FilterSpecFormField<FilterSpecOfType<P>>;
    supportedFor: (
      spec1: SimplifiedPColumnSpec,
      spec2: SimplifiedPColumnSpec | undefined,
    ) => boolean;
  };
};

/** Converts FilterSpecType to a literal string representing the type */
export type FilterSpecTypeToLiteral<T> = [T] extends [FilterSpecType]
  ? "FilterType"
  : [T] extends [SUniversalPColumnId]
    ? "SUniversalPColumnId"
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
