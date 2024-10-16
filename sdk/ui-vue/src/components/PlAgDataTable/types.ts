import type {
  AxisId,
  JoinEntry,
  LocalBlobHandleAndSize,
  PColumnIdAndSpec,
  PFrameHandle,
  PObjectId,
  PTableHandle,
  RemoteBlobHandleAndSize,
  ValueOrErrors,
} from '@platforma-sdk/model';

export type PlDataTableSheet = {
  /** id of the axis to use */
  axis: AxisId;
  /** id of label column to use in filter instead of axis */
  column?: PObjectId;
  /** options to show in the filter tan */
  options: {
    /** value of the option (should be one of the values in the axis or column) */
    value: string | number;
    /** corresponding label */
    text: string;
  }[];
  /** default (selected) value */
  defaultValue?: string | number;
};

/** Data table settings */
export type PlDataTableSettings =
  | {
      /** The type of the source to feed the data into the table */
      sourceType: 'pframe';
      /** PFrame handle output */
      pFrame: PFrameHandle | undefined;
      /** Join used to construct pTable, will be enriched with label-columns */
      join: JoinEntry<PColumnIdAndSpec> | undefined;
      /** Partitioning axes to make sheets */
      sheetAxes: AxisId[];
      /** PTable handle output */
      pTable: PTableHandle | undefined;
    }
  | {
      /** The type of the source to feed the data into the table */
      sourceType: 'ptable';
      /** PTable handle output */
      pTable: PTableHandle | undefined;
      /** Sheets that we want to show in our table */
      sheets?: PlDataTableSheet[];
    }
  | {
      /** The type of the source to feed the data into the table */
      sourceType: 'xsv';
      xsvFile: ValueOrErrors<RemoteBlobHandleAndSize | undefined> | ValueOrErrors<LocalBlobHandleAndSize | undefined> | undefined;
    };
