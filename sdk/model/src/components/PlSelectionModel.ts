import type { AxesSpec, PTableAbsent, PTableValue } from '@milaboratories/pl-model-common';
import { PTableNA } from '@milaboratories/pl-model-common';

/** Key is a set of all axes values, which means it is unique across rows */
export type PTableKey = AxisValue[];

/** Readable axis value */
export type AxisValue = string | number | PTableAbsent;

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

export function mapPTableValueToAxisKey(value: PTableValue): AxisValue {
  if (value === PTableNA) {
    console.error('Axis value can never be N/A');
    return ''; // @TODO: add proper handling
  }
  return value;
}
