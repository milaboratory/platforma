import type { FilterSpec, FilterSpecOfType, FilterSpecType, SimplifiedPColumnSpec, SUniversalPColumnId } from '@platforma-sdk/model';

export type FilterSpecTypeField<V> = {
  fieldType: FilterSpecTypeToLiteral<V>;
  label: string;
  defaultValue: () => V | undefined;
};

export type FilterSpecTypeFieldRecord<T extends FilterSpec> = { [K in keyof T]: FilterSpecTypeField<T[K]>; };

export type FilterSpecFormField<T extends FilterSpec> = {
  [K in Exclude<keyof T, 'id' | 'name' | 'isExpanded'>]: FilterSpecTypeField<T[K]>
};

export type FilterSpecMetadataRecord<T extends FilterSpecType> = {
  [P in T]: {
    label: string;
    labelNot?: string;
    form: FilterSpecFormField<FilterSpecOfType<P>>;
    supportedFor: (spec1: SimplifiedPColumnSpec, spec2: SimplifiedPColumnSpec | undefined) => boolean;
  }
};

export type FilterSpecTypeToLiteral<T> =
    [T] extends [FilterSpecType] ? 'FilterType' :
        [T] extends [SUniversalPColumnId] ? 'SUniversalPColumnId' :
            [T] extends [number] ? 'number' :
                [T] extends [number | undefined] ? 'number?' :
                    [T] extends [string] ? 'string' :
                        [T] extends [string | undefined] ? 'string?' :
                            [T] extends [boolean] ? 'boolean' :
                                [T] extends [boolean | undefined] ? 'boolean?' :
                                    [T] extends [unknown[]] ? 'unknown[]' :
                                    // this is special
                                      T extends number ? 'number' :
                                        T extends string ? 'string' :
                                          T extends boolean ? 'boolean' :
                                            T extends Record<string, unknown> ? 'form' :
                                              'unknown';
