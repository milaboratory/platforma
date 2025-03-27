import type { AAxisSelector, APColumnSelector } from '@milaboratories/pl-model-common';

/**
 * AAxisSelector with an optional split flag
 */
export type AAxisSelectorWithSplit = AAxisSelector & {
  split?: boolean;
};

/**
 * APColumnSelector with an optional split flag for each axis
 */
export type APColumnSelectorWithSplit = APColumnSelector & {
  axes?: AAxisSelectorWithSplit[];
};
