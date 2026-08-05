import type { BuildQueryInput, SpecQueryJoinEntry } from "@milaboratories/pl-model-common";
import { spec as bindings } from "./generated/pframes_rs_wasip2.js";

export function build(input: BuildQueryInput): SpecQueryJoinEntry {
  return JSON.parse(bindings.Frame.buildQuery(JSON.stringify(input)));
}
