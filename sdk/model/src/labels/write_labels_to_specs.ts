import { Annotation } from "@milaboratories/pl-model-common";
import type { ColumnSnapshot } from "../columns";
import type { WithLabel } from "./derive_labels";

export function writeLabelsToSpecs(items: WithLabel<ColumnSnapshot>[]): void {
  for (const { value, label } of items) {
    // @ts-expect-error - annotations are mutable at runtime, even if not in the type
    value.spec.annotations = value.spec.annotations ?? {};
    value.spec.annotations[Annotation.Label] = label;
    value.spec.annotations["pl7.app/label/isDerived"] = "true";
  }
}
