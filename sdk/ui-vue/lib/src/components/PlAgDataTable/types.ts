import type { AxisId, LocalBlobHandleAndSize, PTableHandle, RemoteBlobHandleAndSize, ValueOrErrors } from '@milaboratory/sdk-ui';

/**
 * Data table settings
 */
export type PlDataTableSettings =
  | {
      /**
       * The type of the source to feed the data into the table.
       */
      sourceType: 'pframe';
      /**
       * PTable handle output
       */
      pTable?: ValueOrErrors<PTableHandle | undefined> | undefined;
      /**
       * Sheets that we want to show in our table
       */
      sheets?: {
        /** id of the axis to use */
        axis: AxisId;
        /** options to show in the filter tan */
        options: {
          /** value of the option (should be one of the values in the axis) */
          value: string | number;
          /** corresponding label */
          text: string;
        }[];
        /** default (selected) value */
        defaultValue?: string | number;
      }[];
    }
  | {
      sourceType: 'xsv';
      xsvFile?: ValueOrErrors<RemoteBlobHandleAndSize | undefined> | ValueOrErrors<LocalBlobHandleAndSize | undefined> | undefined;
    };
