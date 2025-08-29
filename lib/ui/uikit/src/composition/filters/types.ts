import type { FilterUi, FilterUiOfType, FilterUiType, SimplifiedPColumnSpec, SUniversalPColumnId } from '@platforma-sdk/model';

export type FilterUiTypeField<V> = {
  fieldType: FilterUiTypeToLiteral<V>;
  label: string;
  defaultValue: () => V | undefined;
};

export type FilterUiFormField<T extends FilterUi> = {
  [K in Exclude<keyof T, 'id' | 'name' | 'isExpanded'>]: FilterUiTypeField<T[K]>
};

export type FilterUiMetadataRecord<T extends FilterUiType> = {
  [P in T]: {
    label: string;
    labelNot?: string;
    form: FilterUiFormField<FilterUiOfType<P>>;
    supportedFor: (spec1: SimplifiedPColumnSpec, spec2: SimplifiedPColumnSpec | undefined) => boolean;
  }
};

export type FilterUiTypeToLiteral<T> =
    [T] extends [FilterUiType] ? 'FilterUiType' :
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
