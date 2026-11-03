import * as v from "valibot";

export const LocalDevFolder = v.object({
  type: v.literal("local-dev"),
  path: v.string(),
});
export type LocalDevFolder = v.InferOutput<typeof LocalDevFolder>;

/** @deprecated don't use */
export const RemoteRegistryV1Spec = v.object({
  type: v.literal("remote-v1"),
  url: v.pipe(v.string(), v.url()),
});
/** @deprecated don't use */
export type RemoteRegistryV1Spec = v.InferOutput<typeof RemoteRegistryV1Spec>;

export const RemoteRegistryV2Spec = v.object({
  type: v.literal("remote-v2"),
  url: v.pipe(v.string(), v.url()),
});
export type RemoteRegistryV2Spec = v.InferOutput<typeof RemoteRegistryV2Spec>;

export const RegistrySpec = v.variant("type", [
  RemoteRegistryV1Spec,
  RemoteRegistryV2Spec,
  LocalDevFolder,
]);
export type RegistrySpec = v.InferOutput<typeof RegistrySpec>;

export const RegistryEntry = v.object({
  id: v.string(),
  title: v.optional(v.string()),
  spec: RegistrySpec,
});
export type RegistryEntry = v.InferOutput<typeof RegistryEntry>;

export const RegistryList = v.array(RegistryEntry);
export type RegistryList = v.InferOutput<typeof RegistryList>;
