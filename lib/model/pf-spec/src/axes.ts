import type { AxesId, AxesSpec, SingleAxisSelector } from "@milaboratories/pl-model-common";
import { spec as bindings } from "./generated/pframes_rs_wasip2.js";

export function expand(spec: AxesSpec): AxesId {
  using axes = bindings.Axes.fromJson(JSON.stringify(spec));
  return JSON.parse(axes.expand());
}

export function collapse(ids: AxesId): AxesSpec {
  return JSON.parse(bindings.Axes.collapse(JSON.stringify(ids)));
}

export function find(spec: AxesSpec, selector: SingleAxisSelector): number {
  using axes = bindings.Axes.fromJson(JSON.stringify(spec));
  try {
    return JSON.parse(axes.find(JSON.stringify(selector)));
  } catch {
    return -1;
  }
}
