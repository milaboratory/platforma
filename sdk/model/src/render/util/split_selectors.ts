import type {
  AAxisSelector,
  PColumnSelector,
  AnchoredPColumnSelector,
  LegacyAxisSelector,
} from "@milaboratories/pl-model-common";

/**
 * AAxisSelector with an optional split flag
 */
export type AAxisSelectorWithSplit = AAxisSelector & {
  split?: boolean;
};

/**
 * APColumnSelector with an optional split flag for each axis
 */
export type APColumnSelectorWithSplit = AnchoredPColumnSelector & {
  axes?: AAxisSelectorWithSplit[];
};

/**
 * AxisSelector with an optional split flag
 */
export type AxisSelectorWithSplit = LegacyAxisSelector & {
  split?: boolean;
};

/**
 * PColumnSelector with an optional split flag for each axis
 */
export type PColumnSelectorWithSplit = PColumnSelector & {
  axes?: AxisSelectorWithSplit[];
};
