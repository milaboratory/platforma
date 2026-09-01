import * as v from "valibot";
import { PlRegAddress } from "../common_types";
import { SemVer } from "@milaboratories/pl-model-middle-layer";

export const PlPackageConfigData = v.object({
  organization: v.string(),
  package: v.string(),
  version: v.optional(SemVer),
  files: v.optional(v.record(v.pipe(v.string(), v.regex(/^[^/]+$/)), v.string()), {}),
  meta: v.looseObject({}),
});

export const PlRegCommonConfigData = v.object({
  registries: v.optional(v.record(v.string(), PlRegAddress), {}),
  registry: v.optional(v.string()),
});
export type PlRegCommonConfigData = v.InferOutput<typeof PlRegCommonConfigData>;

export const PlRegFullPackageConfigData = v.object({
  ...PlRegCommonConfigData.entries,
  ...PlPackageConfigData.entries,
  registry: v.string(),
  version: SemVer,
});
export type PlRegFullPackageConfigData = v.InferOutput<typeof PlRegFullPackageConfigData>;

/**
 * Every field optional except `registries` and `files`, which keep their `{}`
 * defaults so a shard can be merged key-by-key without null checks.
 */
export const PlRegPackageConfigDataShard = v.object({
  ...v.partial(PlRegFullPackageConfigData).entries,
  registries: PlRegCommonConfigData.entries.registries,
  files: PlPackageConfigData.entries.files,
});
export type PlRegPackageConfigDataShard = v.InferOutput<typeof PlRegPackageConfigDataShard>;

export const PlPackageJsonConfigFile = "pl.package.json";
export const PlPackageYamlConfigFile = "pl.package.yaml";
