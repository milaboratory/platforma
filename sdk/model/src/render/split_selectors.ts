import type { AAxisSelector, AnchoredPColumnSelector } from '@milaboratories/pl-model-common';

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
