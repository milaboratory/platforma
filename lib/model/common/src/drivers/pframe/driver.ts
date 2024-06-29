import { Branded } from '../../branding';
import { PTable } from './table';
import { PFrame } from './pframe';

/** PFrame handle */
export type PFrameHandle = Branded<string, 'PFrame'>

/** PFrame handle */
export type PTableHandle = Branded<string, 'PTable'>

/** Allows to access main data layer features of platforma */
export interface PFrameDriver {
  /** Returns PFrame object, to search, retrieve and combine data across many
   * PColumns */
  getPFrame(handle: PFrameHandle): PFrame;

  /** Returns PTable object, to retrieve data from a single fixed shape PTable */
  getPTable(handle: PTableHandle): PTable;
}
