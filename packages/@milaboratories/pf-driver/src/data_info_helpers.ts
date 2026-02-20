import {
  PFrameDriverError,
  type PColumnSpec,
  type PColumnValues,
  type JsonDataInfo,
  type PColumnValue,
} from "@platforma-sdk/model";

export function makeJsonDataInfo(spec: PColumnSpec, data: PColumnValues): JsonDataInfo {
  const keyLength = spec.axesSpec.length;
  const jsonData: Record<string, PColumnValue> = {};
  for (const { key, val } of data) {
    if (key.length !== keyLength) {
      const error = new PFrameDriverError(`Inconsistent inline column key length`);
      error.cause = new Error(
        `Inline column key length ${key.length} differs from axes count ${keyLength}`,
      );
      throw error;
    }
    jsonData[JSON.stringify(key)] = val;
  }

  return {
    type: "Json",
    keyLength,
    data: jsonData,
  };
}
