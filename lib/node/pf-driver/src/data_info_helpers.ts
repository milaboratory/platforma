import {
  PFrameDriverError,
  type PColumnSpec,
  type PColumnValues,
  type JsonDataInfo,
  type PColumnValue,
} from '@platforma-sdk/model';

export function makeDataInfoFromPColumnValues(
  spec: PColumnSpec,
  data: PColumnValues,
): JsonDataInfo {
  const keyLength = spec.axesSpec.length;
  const jsonData: Record<string, PColumnValue> = {};
  for (const { key, val } of data) {
    if (key.length !== keyLength)
      throw new PFrameDriverError(`inline column key length ${key.length} differs from axes count ${keyLength}`);
    jsonData[JSON.stringify(key)] = val;
  }

  return {
    type: 'Json',
    keyLength,
    data: jsonData,
  };
}
