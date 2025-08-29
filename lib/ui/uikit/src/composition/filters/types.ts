import type { FiltersUi, FiltersUiOfType, FiltersUiType, SimplifiedPColumnSpec, SUniversalPColumnId } from '@platforma-sdk/model';

export type FiltersUiTypeField<V> = {
  fieldType: FiltersUiTypeToLiteral<V>;
  label: string;
  defaultValue: () => V | undefined;
};

export type FiltersUiFormField<T extends FiltersUi> = {
  [K in Exclude<keyof T, 'id' | 'name' | 'isExpanded'>]: FiltersUiTypeField<T[K]>
};

export type FiltersUiMetadataRecord<T extends FiltersUiType> = {
  [P in T]: {
    label: string;
    labelNot?: string;
    form: FiltersUiFormField<FiltersUiOfType<P>>;
    supportedFor: (spec1: SimplifiedPColumnSpec, spec2: SimplifiedPColumnSpec | undefined) => boolean;
  }
};

export type FiltersUiTypeToLiteral<T> =
    [T] extends [FiltersUiType] ? 'FilterUiType' :
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
