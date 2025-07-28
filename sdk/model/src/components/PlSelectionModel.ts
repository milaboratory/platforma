import type { AxesSpec, PTableValueAxis } from '@milaboratories/pl-model-common';

/** Key is a set of all axes values, which means it is unique across rows */
export type PTableKey = PTableValueAxis[];

/**
 * Information on selected rows.
 * for selectedKeys = [[axis1Value, axis2Value, axis3Value], ...]
 * axesSpec would be [axis1Spec, axis2Spec, axis3Spec]
 */
export type PlSelectionModel = {
  /** Specs for {@link AxisValue}'s in {@link PTableKey} */
  axesSpec: AxesSpec;
  /** Row keys (arrays of axes values) of selected rows */
  selectedKeys: PTableKey[];
};

export function createPlSelectionModel(): PlSelectionModel {
  return {
    axesSpec: [],
    selectedKeys: [],
  };
}
