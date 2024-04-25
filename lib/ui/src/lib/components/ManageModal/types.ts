import type { Component } from 'vue';

export type Column<S = unknown> = {
  id: string;
  spec: S;
};

export type ColumnSettings<S = unknown> = {
  title: string;
  description: string;
  defaultSpec: () => S;
  component?: Component<{ column: Column }>;
  isDefault?: boolean;
};

export type ColumnInfo<S = unknown> = {
  id: string;
  title: string;
  description: string;
  spec: S;
  component?: Component<{ column: Column }>;
  isDefault?: boolean;
};

export type ManageModalSettings<S = unknown> = {
  title: string;
  columnSettings: ColumnSettings<S>[];
  items: { id: string; spec: S }[];
  findColumnSettings(spec: S): ColumnSettings;
  defaultColumn(): ColumnSettings;
};
