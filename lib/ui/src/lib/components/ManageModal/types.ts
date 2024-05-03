import type { Component } from 'vue';

export type Column<S = unknown> = {
  id: string;
  spec: S;
  columnSettings: Omit<ColumnSettings, 'component'>;
  isValid: boolean;
};

export type ColumnSettings<S = unknown> = {
  title: string;
  description: string;
  resolveTitle?: (this: S) => string;
  refine?: (this: S) => S;
  defaultSpec: () => S;
  component?: Component<{ column: { id: string; spec: unknown } }>;
  isDefault?: boolean;
};

export type ManageModalSettings<S = unknown> = {
  title: string;
  addTitle?: string;
  columnSettings: ColumnSettings<S>[];
  items: { id: string; spec: S }[];
  findColumnSettings(spec: S): ColumnSettings<S>;
  defaultColumnSettings(): ColumnSettings<S>;
  refine?: (spec: unknown) => S;
  validate?: (spec: unknown) => boolean;
};
