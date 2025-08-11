import type { LocalImportFileHandle } from '@milaboratories/pl-model-common';
import { getRawPlatformaInstance } from '@platforma-sdk/model';
import { parse } from 'csv-parse/browser/esm';
import type { MaybeRefOrGetter } from 'vue';
import { shallowRef, toValue, watch } from 'vue';
import type { ValueType } from '../types/spec';

export async function useMetadataXsv(fileHandle: MaybeRefOrGetter<undefined | LocalImportFileHandle>, delimiter: MaybeRefOrGetter<undefined | string>) {
  const ref = shallowRef({
    header: [] as string[],
    types: {} as Record<string, ValueType>,
  });

  watch([fileHandle, delimiter], async ([_fileHandle, _delimiter]) => {
    ref.value = {
      header: [],
      types: {},
    };

    const fileHandle = toValue(_fileHandle) as LocalImportFileHandle;
    const delimiter = toValue(_delimiter);

    if (!fileHandle || !delimiter) {
      return;
    }

    const { header, rows } = await parseLocalXsvFile({ fileHandle, delimiter, linesLimit: 30 });
    const types = getColumnTypes(header, rows);

    ref.value = {
      header,
      types,
    };
  });

  return ref;
}

export async function parseLocalXsvFile<T extends object>({ fileHandle, delimiter, linesLimit, batchSizeReading }: {
  fileHandle: LocalImportFileHandle;
  delimiter: string;
  linesLimit: number;
  batchSizeReading?: number;
}) {
  return new Promise<{ header: (keyof T)[]; rows: T[] }>((resolve, reject) => {
    const driver = getRawPlatformaInstance().lsDriver;
    const parser = parse({
      columns: true,
      delimiter,
      autoParse: true,
    });
    const rows: T[] = [];
    let header: null | string[] = null;

    parser.on('readable', () => {
      let record;
      while ((record = parser.read()) !== null) {
        if (!header) header = Object.keys(record);
        rows.push(record);
      }
    });

    parser.on('error', (err) => {
      reject(new Error('Error while parsing CSV', { cause: err }));
    });

    parser.on('end', () => {
      resolve({ header: (header ?? []) as (keyof T)[], rows });
    });

    const decoder = new TextDecoder();
    const chunkSize = batchSizeReading ?? 8192;

    function reading(done: boolean, iteration: number, textBuffer: string = ''): Promise<void> {
      if (done) {
        parser.end();
        return Promise.resolve();
      }

      return driver.getLocalFileContent(fileHandle, { offset: iteration, length: chunkSize }).then(
        (fileBuffer) => {
          if (fileBuffer.length === 0) {
            return reading(true, iteration + 1);
          }

          // Decode the chunk and add to buffer
          const chunk = decoder.decode(fileBuffer, { stream: true });
          textBuffer += chunk;

          // Extract complete lines from buffer
          const lines = textBuffer.split('\n');

          // Keep the last incomplete line in buffer
          textBuffer = lines.pop() || '';

          // Process complete lines
          for (const line of lines) {
            if (line.trim()) { // Skip empty lines
              parser.write(line + '\n');
              if (rows.length >= linesLimit) {
                return reading(true, iteration + 1);
              }
            }
          }

          return reading(false, iteration + 1, textBuffer);
        },
      );
    }

    reading(false, 0).catch((err) => {
      reject(new Error('Error while reading file content', { cause: err }));
    });
  });
}

export function getColumnTypes<T extends object>(header: string[], rows: T[]): Record<string, ValueType> {
  const columnTypes: Record<string, ValueType> = {};

  for (const columnName of header) {
    let detectedType: ValueType = 'String';

    // Analyze values in this column to determine the most appropriate type
    for (const row of rows) {
      const value = (row as Record<string, unknown>)[columnName];

      if (value === null || value === undefined || value === '') {
        continue; // Skip empty values
      }

      const stringValue = String(value).trim();
      if (stringValue === '') continue;

      // Check if it's an integer
      if (/^-?\d+$/.test(stringValue)) {
        const numValue = parseInt(stringValue, 10);
        if (detectedType === 'String') {
          detectedType = (numValue >= -2147483648 && numValue <= 2147483647) ? 'Int' : 'Long';
        } else if (detectedType === 'Int' && (numValue < -2147483648 || numValue > 2147483647)) {
          detectedType = 'Long';
        }
        continue;
      }

      // Check if it's a float/double
      if (/^-?\d*\.?\d+([eE][+-]?\d+)?$/.test(stringValue) && !isNaN(Number(stringValue))) {
        const numValue = Number(stringValue);
        if (detectedType === 'String' || detectedType === 'Int' || detectedType === 'Long') {
          // Use Float for smaller precision numbers, Double for higher precision
          detectedType = (Math.abs(numValue) < 3.4e38 && numValue.toString().length <= 7) ? 'Float' : 'Double';
        } else if (detectedType === 'Float' && (Math.abs(numValue) >= 3.4e38 || numValue.toString().length > 7)) {
          detectedType = 'Double';
        }
        continue;
      }

      // If we encounter any non-numeric value, default to String
      detectedType = 'String';
      break;
    }

    columnTypes[columnName] = detectedType;
  }

  return columnTypes;
}
