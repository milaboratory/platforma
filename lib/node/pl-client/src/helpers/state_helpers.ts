import type { FieldData } from "../core/types";
import { isNotNullSignedResourceId } from "../core/types";

export function fieldResolved(data: Pick<FieldData, "value" | "error">) {
  return isNotNullSignedResourceId(data.error) || isNotNullSignedResourceId(data.value);
}
