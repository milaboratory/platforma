import type { AAxisSelector, AnchoredPColumnSelector, AxisSelector, PColumnSelector } from '@milaboratories/pl-model-common';

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
export type AxisSelectorWithSplit = AxisSelector & {
  split?: boolean;
};

/**
 * PColumnSelector with an optional split flag for each axis
 */
export type PColumnSelectorWithSplit = PColumnSelector & {
  axes?: AxisSelectorWithSplit[];
};
